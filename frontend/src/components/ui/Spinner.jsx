export default function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 12,
        height: 12,
        borderRadius: '50%',
        border: '2px solid var(--green)',
        borderTopColor: 'transparent',
        animation: 'spin .8s linear infinite',
      }}
    />
  )
}
