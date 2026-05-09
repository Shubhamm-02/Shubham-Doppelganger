export type EvalCase = {
  id: string;
  category: "resume" | "project" | "calendar" | "unsupported";
  question: string;
  expectedBehavior: string;
};

export const DAY_ONE_EVAL_CASES: EvalCase[] = [
  {
    id: "project-pdf-grounded",
    category: "project",
    question: "How does the PDF Grounded Chatbot avoid hallucinations?",
    expectedBehavior: "Answer from the PDF Grounded Chatbot project note."
  },
  {
    id: "project-comment-ai",
    category: "project",
    question: "What anti-spam guardrails are in CommentAI?",
    expectedBehavior: "Answer from the CommentAI project note."
  },
  {
    id: "project-ccpa",
    category: "project",
    question: "What role does FAISS play in the CCPA project?",
    expectedBehavior: "Answer from the CCPA project note."
  },
  {
    id: "unsupported",
    category: "unsupported",
    question: "Did Shubham win the IISc hackathon?",
    expectedBehavior: "Answer accurately that the CCPA project did not win a prize."
  }
];
