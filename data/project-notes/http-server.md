# HTTP Server Assignment

This is my HTTP server implementation for the Computer Networks assignment. I built it from scratch using Python sockets and threading to demonstrate networking concepts.

##  Features

### Core Functionality
- **Multi-threading**: Thread pool with queue management
- **HTTP/1.1 Protocol**: Keep-alive connections
- **Binary File Transfer**: Images, documents, and binary content
- **JSON Processing**: POST requests with JSON data
- **Connection Management**: Timeouts and connection limits

### Security Features
- **Path Traversal Protection**: Blocks ../, ./, //, \ patterns
- **Host Header Validation**: Checks host header matches server
- **Request Size Limits**: 8KB max request size
- **Input Sanitization**: URL decoding and validation
- **Connection Timeout**: 30-second timeout

### File Handling
- **HTML Files**: Served with proper MIME types
- **Binary Files**: PNG, JPEG, TXT files as downloads
- **Download Headers**: Content-Disposition headers
- **File Integrity**: Binary data preservation

## 📁 Project Structure

```
project/
├── server.py                 # Main server implementation
├── create_test_images.py     # Script to generate test images
├── README.md                # This documentation
└── resources/               # Web content directory
    ├── index.html          # Home page
    ├── about.html          # About page
    ├── contact.html        # Contact/testing page
    ├── sample.txt          # Test text file
    ├── logo.png            # Test PNG image
    ├── photo.jpg           # Test JPEG image
    ├── large_image.png     # Large test image (>1MB)
    ├── test_image.jpg      # Additional test image
    └── uploads/            # Directory for POST uploads
```

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.6 or higher
- No external dependencies required (uses only standard library)

### Optional Dependencies
- **Pillow (PIL)**: For generating real test images
  ```bash
  pip install Pillow
  ```

### Setup
1. Clone or download the project
2. Create the resources directory structure:
   ```bash
   mkdir -p resources/uploads
   ```
3. Generate test images (optional):
   ```bash
   python3 create_test_images.py
   ```

##  Usage

### Basic Usage
```bash
# Start with defaults (127.0.0.1:8080, 10 threads)
python3 server.py

# Custom port
python3 server.py 8000

# Custom port and host
python3 server.py 8000 0.0.0.0

# Custom port, host, and threads
python3 server.py 8000 0.0.0.0 20
```

### Command Line Arguments
1. **Port** (optional): Server port number (default: 8080)
2. **Host** (optional): Server host address (default: 127.0.0.1)
3. **Max Threads** (optional): Maximum thread pool size (default: 10)

### Example Commands
```bash
# Development server (localhost only)
python3 server.py

# Production server (all interfaces)
python3 server.py 80 0.0.0.0 50

# Custom configuration
python3 server.py 9000 192.168.1.100 25
```

##  Testing

### Web Interface Testing
1. Start the server: `python3 server.py`
2. Open browser: `http://localhost:8080`
3. Navigate through the test pages:
   - **Home**: Basic functionality overview
   - **About**: Technical details and features
   - **Contact**: JSON upload testing and security tests

### File Download Testing
```bash
# Test HTML file serving
curl http://localhost:8080/

# Test binary file download
curl -O http://localhost:8080/logo.png
curl -O http://localhost:8080/photo.jpg
curl -O http://localhost:8080/sample.txt

# Test large file transfer
curl -O http://localhost:8080/large_image.png
```

### JSON Upload Testing
```bash
# Test POST request with JSON
curl -X POST http://localhost:8080/upload \
  -H "Content-Type: application/json" \
  -d '{"name": "test", "value": 123, "timestamp": "2024-03-15T10:30:00Z"}'
```

### Security Testing
```bash
# Test path traversal protection (should return 403)
curl http://localhost:8080/../etc/passwd
curl http://localhost:8080/./././../config

# Test host validation (should return 403)
curl -H "Host: evil.com" http://localhost:8080/

# Test method validation (should return 405)
curl -X PUT http://localhost:8080/index.html
curl -X DELETE http://localhost:8080/index.html
```

### Concurrency Testing
```bash
# Test multiple simultaneous connections
for i in {1..10}; do
  curl -O http://localhost:8080/large_image.png &
done
wait
```

##  Server Architecture

### Thread Pool Implementation
- **Worker Threads**: Configurable number of worker threads (default: 10)
- **Task Queue**: FIFO queue for pending connections
- **Load Balancing**: Automatic distribution of requests across threads
- **Queue Management**: Handles thread pool saturation gracefully

### Connection Management
- **Keep-Alive Support**: HTTP/1.1 persistent connections
- **Connection Limits**: Maximum 100 requests per connection
- **Timeout Handling**: 30-second idle timeout
- **Graceful Shutdown**: Proper cleanup of resources

### Request Processing Pipeline
1. **Socket Accept**: Accept incoming connections
2. **Thread Assignment**: Assign to available worker thread
3. **Request Parsing**: Parse HTTP request (method, path, headers, body)
4. **Security Validation**: Validate host header and path
5. **Request Handling**: Process GET/POST requests
6. **Response Generation**: Generate appropriate HTTP response
7. **Connection Management**: Handle keep-alive or close

##  Security Implementation

### Path Traversal Protection
```python
def _validate_path(self, path):
    """Validate path to prevent directory traversal attacks."""
    dangerous_patterns = ['..', './', '//', '\\']
    for pattern in dangerous_patterns:
        if pattern in path:
            return False
    
    # Ensure resolved path stays within resources directory
    full_path = (self.resources_dir / path.lstrip('/')).resolve()
    return str(full_path).startswith(str(self.resources_dir))
```

### Host Header Validation
```python
def _validate_host(self, host_header):
    """Validate Host header against server configuration."""
    valid_hosts = ['localhost', '127.0.0.1', self.host]
    return host.lower() in [h.lower() for h in valid_hosts]
```

##  HTTP Response Examples

### Successful HTML Response (200 OK)
```http
HTTP/1.1 200 OK
Content-Type: text/html; charset=utf-8
Content-Length: 1234
Date: Fri, 15 Mar 2024 10:30:00 GMT
Server: Multi-threaded HTTP Server
Connection: keep-alive
Keep-Alive: timeout=30, max=100

<!DOCTYPE html>...
```

### Binary File Response (200 OK)
```http
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Length: 45678
Content-Disposition: attachment; filename="image.png"
Date: Fri, 15 Mar 2024 10:30:00 GMT
Server: Multi-threaded HTTP Server
Connection: keep-alive

[binary data]
```

### JSON Upload Response (201 Created)
```http
HTTP/1.1 201 Created
Content-Type: application/json
Content-Length: 156
Date: Fri, 15 Mar 2024 10:30:00 GMT
Server: Multi-threaded HTTP Server
Connection: keep-alive

{
  "status": "success",
  "message": "File created successfully",
  "filepath": "/uploads/upload_20240315_103000_a7b9.json"
}
```

### Error Response (403 Forbidden)
```http
HTTP/1.1 403 Forbidden
Content-Type: text/html; charset=utf-8
Content-Length: 0
Date: Fri, 15 Mar 2024 10:30:00 GMT
Server: Multi-threaded HTTP Server
Connection: close
```

##  Logging

The server provides comprehensive logging with timestamps and thread information:

```
[2024-03-15 10:30:00] [Main] HTTP Server started on http://127.0.0.1:8080
[2024-03-15 10:30:00] [Main] Thread pool size: 10
[2024-03-15 10:30:00] [Main] Serving files from 'resources' directory
[2024-03-15 10:30:15] [Thread-1] Connection from 127.0.0.1:54321
[2024-03-15 10:30:15] [Thread-1] Request: GET /image.png HTTP/1.1
[2024-03-15 10:30:15] [Thread-1] Host validation: localhost:8080 ✓
[2024-03-15 10:30:15] [Thread-1] Sending binary file: image.png (45678 bytes)
[2024-03-15 10:30:15] [Thread-1] Response: 200 OK (45678 bytes transferred)
[2024-03-15 10:30:15] [Thread-1] Connection: keep-alive
```

##  Error Handling

### HTTP Status Codes
- **200 OK**: Successful request
- **201 Created**: File created successfully (POST)
- **400 Bad Request**: Malformed request or missing Host header
- **403 Forbidden**: Unauthorized path access or Host mismatch
- **404 Not Found**: Requested resource doesn't exist
- **405 Method Not Allowed**: Non-GET/POST methods
- **415 Unsupported Media Type**: Wrong Content-Type or file type
- **500 Internal Server Error**: Server-side errors
- **503 Service Unavailable**: Thread pool exhausted

### Error Recovery
- Graceful handling of malformed requests
- Automatic connection cleanup on errors
- Thread pool recovery from exceptions
- Proper resource deallocation

##  Configuration

### Server Configuration
- **Default Host**: 127.0.0.1 (localhost)
- **Default Port**: 8080
- **Default Thread Pool**: 10 threads
- **Connection Queue**: 50 pending connections
- **Request Size Limit**: 8192 bytes
- **Connection Timeout**: 30 seconds
- **Max Requests per Connection**: 100

### Content Type Mappings
- `.html` → `text/html; charset=utf-8`
- `.txt` → `application/octet-stream`
- `.png` → `application/octet-stream`
- `.jpg/.jpeg` → `application/octet-stream`

##  Performance Considerations

### Optimization Features
- **Thread Pool**: Efficient request handling with configurable pool size
- **Binary Transfer**: Optimized for large file transfers
- **Connection Reuse**: Keep-alive connections reduce overhead
- **Buffer Management**: 8KB buffer size for efficient I/O

### Scalability
- Configurable thread pool size
- Connection queue management
- Memory-efficient binary file handling
- Proper resource cleanup

##  Test Scenarios

### Basic Functionality Tests
-  GET `/` → Serves `index.html`
-  GET `/about.html` → Serves HTML file
-  GET `/logo.png` → Downloads PNG file
-  GET `/photo.jpg` → Downloads JPEG file
-  GET `/sample.txt` → Downloads text file
-  POST `/upload` with JSON → Creates file in uploads directory

### Error Condition Tests
-  GET `/nonexistent.png` → Returns 404
-  PUT `/index.html` → Returns 405
-  POST `/upload` with non-JSON → Returns 415
-  GET `/../etc/passwd` → Returns 403
-  Request with `Host: evil.com` → Returns 403

### Binary Transfer Tests
-  Downloaded PNG file matches original (checksum verification)
-  Downloaded JPEG file matches original
-  Large image files (>1MB) transfer completely
-  Binary data integrity maintained

### Concurrency Tests
-  Handle 5 simultaneous file downloads
-  Queue connections when thread pool is full
-  Multiple clients downloading large files simultaneously

##  Technical Details

### Binary File Transfer Implementation
```python
def _handle_get_request(self, client_socket, request, thread_name):
    """Handle GET request with binary file support."""
    if content_type == 'application/octet-stream':
        # Binary file - read in binary mode
        with open(file_path, 'rb') as f:
            content = f.read()
        
        headers = {
            'Content-Type': content_type,
            'Content-Length': str(len(content)),
            'Content-Disposition': f'attachment; filename="{filename}"',
            # ... other headers
        }
        
        self._send_response(client_socket, 200, "OK", headers, content)
```

### Thread Pool Architecture
```python
class ThreadPool:
    def __init__(self, max_threads=10):
        self.max_threads = max_threads
        self.task_queue = queue.Queue()
        self.active_threads = 0
        self.lock = threading.Lock()
        
        # Start worker threads
        for i in range(max_threads):
            thread = threading.Thread(target=self._worker, name=f"Thread-{i+1}")
            thread.daemon = True
            thread.start()
```

##  Known Limitations

1. **File Size**: No explicit file size limits (limited by available memory)
2. **Concurrent Connections**: Limited by thread pool size and system resources
3. **SSL/TLS**: No HTTPS support (HTTP only)
4. **Authentication**: No built-in authentication mechanism
5. **Caching**: No HTTP caching implementation
6. **Compression**: No content compression (gzip/deflate)

##  Future Enhancements

- SSL/TLS support for HTTPS
- HTTP/2 protocol support
- Content compression (gzip/deflate)
- Authentication and authorization
- Request rate limiting
- Advanced caching mechanisms
- WebSocket support
- Configuration file support

##  License

This project is created for educational purposes as part of a Computer Networks assignment.

##  Author

Created as part of a comprehensive HTTP server implementation assignment demonstrating:
- Socket programming
- Multi-threading and concurrency
- HTTP protocol implementation
- Network security principles
- Binary data handling
- Error handling and logging

---

