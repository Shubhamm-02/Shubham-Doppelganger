import { loadEnvConfig } from "@next/env";
import { DAY_ONE_EVAL_CASES } from "../lib/evals";
import { answerProfileQuestion } from "../lib/profile/answer";

loadEnvConfig(process.cwd());

async function main() {
  for (const evalCase of DAY_ONE_EVAL_CASES) {
    const result = await answerProfileQuestion(evalCase.question);
    console.log(`\n[${evalCase.id}] ${evalCase.question}`);
    console.log(`Expected: ${evalCase.expectedBehavior}`);
    console.log(`Grounded: ${result.grounded}`);
    console.log(`Sources: ${result.sources.map((source) => source.id).join(", ") || "none"}`);
    console.log(result.answer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
