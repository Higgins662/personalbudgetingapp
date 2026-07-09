/**
 * Full-width step indicator for the onboarding wizard.
 *
 * Each wrap gets equal flex space. The connector line is absolutely
 * positioned from the center of one dot to the center of the next,
 * so all 6 dots distribute evenly regardless of label length.
 */
export default function StepTrack({ step, steps }) {
  return (
    <div className="wiz-step-track">
      {steps.map((s, i) => {
        const n   = i + 1
        const cls = n < step ? 'done' : n === step ? 'active' : 'future'
        const isLast = i === steps.length - 1
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
            {/* Line runs from this dot's center to the next dot's center */}
            {!isLast && (
              <div className={`wiz-step-line${n < step ? ' done' : ''}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
