/**
 * Full-width step indicator for the onboarding wizard.
 *
 * Each step segment is [dot+label] [line], where the line flexes to fill
 * the remaining space equally between steps — so the track always spans
 * the full width of the wizard header regardless of step count or label length.
 *
 * Props:
 *   step  — current active step number (1-based)
 *   steps — array of { label } objects
 */
export default function StepTrack({ step, steps }) {
  return (
    <div className="wiz-step-track">
      {steps.map((s, i) => {
        const n   = i + 1
        const cls = n < step ? 'done' : n === step ? 'active' : 'future'
        return (
          <div key={s.label} className="wiz-step-wrap">
            <div className="wiz-step-node">
              <div className={`wiz-step-dot ${cls}`}>
                {n < step ? '✓' : n}
              </div>
              <div
                className="wiz-step-label"
                style={{ color: n === step ? '#e8d58a' : '#6b7f94' }}
              >
                {s.label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className={`wiz-step-line${n < step ? ' done' : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
