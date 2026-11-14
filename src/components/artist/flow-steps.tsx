/** Shared indicator for the three separate authoring screens: information/training, interview, review. */
export function FlowSteps({ current, interviewEnabled }: { current: 1 | 2 | 3; interviewEnabled: boolean }) {
  const steps = [{ step: 1, label: "정보·학습" }, ...(interviewEnabled ? [{ step: 2, label: "AI 인터뷰" }] : []), { step: 3, label: "검토" }];
  return <ol className="artist-flow" aria-label="전시 준비 단계">
    {steps.map(({ step, label }, index) => <li key={step} aria-current={step === current ? "step" : undefined}>
      <span aria-hidden="true">{index + 1}</span>{label}
    </li>)}
  </ol>;
}
