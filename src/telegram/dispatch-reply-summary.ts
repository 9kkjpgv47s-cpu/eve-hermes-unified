function summarizeDispatch(result: {
  envelope: { traceId: string };
  decision: string;
  response: { failureClass: string; laneUsed: string; responseText: string };
}): string {
  const lines = [
    `trace: ${result.envelope.traceId}`,
    `lane: ${result.response.laneUsed}`,
    `class: ${result.response.failureClass}`,
    `decision: ${result.decision}`,
    "",
    result.response.responseText.slice(0, 3500),
  ];
  return lines.join("\n");
}

export { summarizeDispatch };
