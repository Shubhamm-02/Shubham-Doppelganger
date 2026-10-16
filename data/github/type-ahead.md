# Type-Ahead

- GitHub: https://github.com/Shubhamm-02/Type-Ahead
- Created: 2026-06-21
- Last pushed: 2026-06-21
- Languages: JavaScript, CSS, HTML
- Topics: None
- Description: None

## README

# Search Typeahead System

A search-as-you-type suggestion system, like the dropdown you see on Google,
Amazon, or YouTube. As you type a **prefix**, it returns the **top 10 most
popular queries** that start with it, ranked by how often they've been
searched. It also records searches, surfaces **trending** queries, serves reads
from a **distributed cache** spread with **consistent hashing**, and protects
the database using **batched writes**.

> The focus of this project is the **backend data-system design**: how data is
> stored, indexed, cached, distributed, and written efficiently, not just a UI.

---

## Table of contents

1. Quick start
2. What it does (features)
3. Architecture at a glance
4. The two request flows
5. Every component, explained (with analogies)
   - Trie / prefix index
   - Distributed cache
   - Consistent hashing
   - Query-count store ("the DB")
   - Batch writes
   - Trending searches
   - Debouncing (frontend)
   - Metrics & p95 latency
6. Design decisions & trade-offs
7. API documentation
8. Configuration
9. Performance report
10. Project structure
11. Dataset

---

## Quick start

**Requirements:** Node.js 18+ (built and tested on Node 22). No database, no
Redis, nothing else to install, everything runs in one process so local setup
is trivial.

```bash
# 1. install the one dependency (express)
npm install

# 2. generate the dataset (120,000 queries): only needed once
npm run gen-data

# 3. start the server
npm start
```

Then open **http://localhost:3000** and start typing.

To reproduce the performance numbers, in a second terminal:

```bash
npm run bench
```

---

## What it does

| Feature | Where | Requirement met |
|---|---|---|
| Top-10 prefix suggestions, sorted by count | `src/trie.js` | 4.1 Typeahead |
| Handles empty input, mixed case, no matches | `src/trie.js` (`normalize`) | 4.1 |
| Debounced input, keyboard nav, loading/error states | `public/` | 4.1, 9 |
| Search submission returns `{"message":"Searched"}` | `src/server.js` | 4.2 |
| Increment existing / insert new query | `src/store.js` + `trie.js` | 4.2 |
| Cache-before-DB with TTL + invalidation | `src/cache.js` | 6 |
| Distributed cache nodes + consistent hashing | `src/cache.js` + `consistentHashing.js` | 6 |
| Trending: `/suggest?rank=basic\|enhanced` (recency-aware) | `src/trending.js` | 7 |
| Batch writes (buffer, aggregate, flush) | `src/writeBuffer.js` | 8 |
| Metrics: p95, hit rate, DB reads/writes | `src/metrics.js`, `GET /metrics` | 10 |

---

## Architecture at a glance

```
                              ┌─────────────────────────────┐
        Browser (public/)     │           BACKEND           │
   ┌────────────────────┐     │                             │
   │  search input      │     │   GET /suggest?q=ip         │
   │  - debounce 120ms  │────────────┐                      │
   │  - keyboard nav    │     │       ▼                      │
   │  - trending list   │     │  ┌──────────────────────┐   │
   └────────────────────┘     │  │  DISTRIBUTED CACHE   │   │
            │                 │  │  cache-0 cache-1 ... │   │
            │ POST /search    │  │  picked by the       │   │
            ▼                 │  │  CONSISTENT-HASH RING│   │
   ┌────────────────────┐     │  └─────────┬────────────┘   │
   │ {"message":         │     │   hit │    │ miss           │
   │   "Searched"}       │     │  ◄────┘    ▼                │
   └────────────────────┘     │      ┌──────────────┐       │
            │                 │      │  TRIE INDEX  │ top-10 │
            ▼                 │      │ (prefix tree)│ per    │
   ┌────────────────────┐     │      │  + cached    │ node   │
   │   WRITE BUFFER     │     │      │  topK lists  │       │
   │ aggregate +50 etc. │     │      └──────┬───────┘       │
   │ flush on size/time │     │             │ built from     │
   └─────────┬──────────┘     │             ▼                │
             │ flush          │      ┌──────────────┐        │
             ├───────────────────────►│  QUERY STORE │ (DB)  │
             │  apply deltas  │      │ query→count  │        │
             ├──────────────► TRIE.increment + TRENDING.record
             └──────────────► CACHE.invalidate(affected prefixes)
                              └─────────────────────────────┘
```

---

## The two request flows

### Read path: `GET /suggest?q=ip` (must be **fast**)

1. Normalize the prefix (`lowercase`, `trim`, collapse spaces) so `"IPhone "`,
   `"iphone"`, and `"iPhone"` are the same key.
2. Ask the **distributed cache**. The consistent-hash ring picks the cache node
   that owns `"ip"`.
   - **HIT** → return the cached list immediately. The trie and DB are never
     touched.
   - **MISS** → compute the top-10 from the **trie** (O(prefix length)), store
     the result in the cache (*cache-aside*), and return it.

### Write path: `POST /search {"q":"iphone"}` (must be **cheap**)

1. Add `+1` for `"iphone"` to the **write buffer** (in memory). The database is
   **not** touched yet.
2. Return `{"message":"Searched"}` immediately, the user doesn't wait for a DB
   write.
3. Later, when the buffer flushes (either it filled up, or the timer fired):
   - apply the aggregated deltas to the **store** (one write per distinct query),
   - update the **trie** counts (and the cached top-K lists along each path),
   - add **trending** heat,
   - **invalidate** the cache entries for every affected prefix so the next
     `/suggest` recomputes fresh results.

---

## Every component, explained

### 1. Trie / prefix index

**File:** `src/trie.js`

**Problem.** When the user types `"ip"` we must instantly find the 10
most-searched queries starting with `"ip"`. Scanning all 120,000 queries on
every keystroke is far too slow.

**A trie (prefix tree)** stores strings character-by-character. The path from
the root to a node spells a prefix; everything below that node shares the
prefix.

> **Analogy.** A library filed letter-by-letter. To find every book starting
> with "ip", you walk to shelf `i` → drawer `p`, and everything in that drawer
> matches. You never touch unrelated shelves.

**The optimization: top-K at every node.** A plain trie still has to gather and
sort *all* queries under a prefix. For a short prefix like `"a"` that could be
thousands. So we cache, at **each node**, that node's own best 10 descendants
(`topK`).

> **Why this is correct (the key insight):** the top-10 under a node are always
> contained in the **union of its children's top-10 lists** (plus the node's own
> word if it's a query). Any query in a node's true top-10 lives in exactly one
> child subtree, and within that *smaller* subtree it can only rank *higher*, so
> it's guaranteed to appear in that child's top-10. Therefore a node's list can
> be rebuilt purely from its children, no full subtree scan.

**Result.** A lookup is just "walk down the prefix, read the cached list at the
final node" → **O(prefix length)**, independent of dataset size. On an
increment we only refresh the topK of nodes **on that one query's path** (leaf
up to root), which is cheap.

**Edge cases handled:** empty input → `[]`; mixed case → normalized; no match →
`[]`.

---

### 2. Distributed cache

**File:** `src/cache.js`

We keep a **cache of `prefix → suggestions`** in front of the trie.

> **Analogy.** The trie is the kitchen; the cache is the tray of ready-made
> dishes on the counter. If the dish is on the tray (a *hit*), serve it
> instantly. If not (a *miss*), cook it once and leave a copy on the tray for
> next time. This is the **cache-aside** pattern.

**Distributed** means several independent cache servers. We model that with
several `CacheNode` objects in one process; a **consistent-hash ring** decides
which node owns each prefix. This keeps the distribution logic real and
*observable* (see `GET /cache/debug`) without you having to install and run a
Redis cluster.

**Freshness is handled two ways:**
- **TTL (time-to-live):** every entry expires after 60s (configurable). After
  that it's treated as a miss. This bounds staleness as a safety net.
- **Active invalidation:** when a batch of writes lands, we delete the cache
  entries for exactly the affected prefixes, so changes show up immediately
  rather than waiting for TTL.

Each node also has a small **LRU cap** (evict the least-recently-used entry when
full) so memory can't grow without bound.

---

### 3. Consistent hashing

**File:** `src/consistentHashing.js`

**Problem with naive hashing.** The obvious way to spread keys over `N` cache
servers is `node = hash(key) % N`. It works until `N` changes. Add or remove one
server and `N` changes, so `% N` changes for **almost every key** at once →
a mass cache miss → a stampede on the database.

**Consistent hashing.**

> **Analogy.** Picture a round clock face numbered `0 … 2³²-1`. Place each server
> at a few points on the rim. To find a key's server, hash the key to a point on
> the rim and **walk clockwise** to the first server you meet. Now add a server:
> it drops onto the rim and only steals the slice of keys between it and the
> previous server. Every other key keeps its home. On average only **K/N** keys
> move when the cluster changes, not all of them.

**Virtual nodes.** With only one point per server, the slices come out uneven.
So each physical server is placed at **many** points (here: **150**). More points
→ the slices average out → balanced load.

> **Analogy.** Instead of one big shop, a chain opens 150 small branches
> scattered around the city, so no single branch gets swamped.

We hash with **FNV-1a** (a small, fast, well-distributed non-cryptographic
hash) and find the owning node with a **binary search** over the sorted ring →
O(log totalPoints). You can watch nodes join/leave the ring via
`POST /admin/cache-node` and `GET /metrics` (`consistentHashing.log`).

---

### 4. Query-count store ("the DB")

**File:** `src/store.js`

This is the **source of truth**: the authoritative `query → count` for every
query. In production this would be PostgreSQL / DynamoDB / Redis. Here it's an
in-memory `Map` loaded from the CSV, with an optional disk **snapshot** so
restarts keep accumulated counts.

**Why separate from the trie?** The trie is a derived **index** optimized for
prefix lookups; the store is the **flat truth**. This mirrors real systems: the
database holds the data, and a search index (a trie, or Elasticsearch) is built
from it for fast queries. Keeping them separate also lets us count **DB
reads/writes** to report database load.

> Note: because the trie holds counts in memory, `/suggest` is served entirely
> by the cache + index and **never reads the DB**: DB read load is essentially
> zero by design. The DB is touched only by **batched writes**.

---

### 5. Batch writes

**File:** `src/writeBuffer.js`

**Problem.** Every `POST /search` wants to do `count = count + 1` in the
database. At high traffic that's a flood of tiny writes, and databases hate many
small writes (each has fixed overhead: locks, disk flush, index update).

**Idea: aggregate, then flush.**

> **Analogy.** A courier doesn't drive to the post office for each letter. They
> collect letters in a mailbag all morning and make **one** trip.

We buffer increments in memory and **aggregate** them: if `"iphone"` is searched
50 times before a flush, the buffer holds a single `{iphone: +50}`. The DB does
**one** write of `+50` instead of 50 writes of `+1`. Repeated hot queries get
the biggest savings (the benchmark shows a **300×** reduction).

**Flush triggers (whichever comes first):**
- **Size**: buffer reaches `maxBatchSize` distinct queries (burst guard).
- **Time**: every `flushIntervalMs` (so quiet traffic still lands promptly).
