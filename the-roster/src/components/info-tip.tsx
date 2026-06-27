export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        color: 'var(--cyan)',
        fontSize: 9,
        cursor: 'help',
        display: 'inline-flex',
        alignItems: 'center',
        lineHeight: 1,
        userSelect: 'none',
      }}
    >
      ⓘ
    </span>
  )
}
