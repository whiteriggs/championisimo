import { computeWinProbabilities, type ProbInput, type ProbabilityResult } from "./winProbability";

const ctx = self as unknown as {
  addEventListener(type: "message", cb: (e: MessageEvent<ProbInput>) => void): void;
  postMessage(message: ProbabilityResult): void;
};

ctx.addEventListener("message", (e) => {
  ctx.postMessage(computeWinProbabilities(e.data));
});
