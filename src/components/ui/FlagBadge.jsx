/**
 * Small warning chip shown next to a row's label when it was flagged
 * during rollover for running significantly over budget last period.
 */
export default function FlagBadge({ variance }) {
  if (variance == null) return null
  return (
    <span
      className="flag-badge"
      title={`Ran ${variance}% over budget last period`}
    >
      ⚠️ {variance}% over last period
    </span>
  )
}
