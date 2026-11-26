// Fish hook mark. Uses currentColor so text-* classes set its colour.
export default function Logo({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx="15" cy="3.5" r="2" />
      <path d="M15 5.5V18a6.5 6.5 0 0 1-13 0v-4" />
      <path d="M2 14l4 3" />
    </svg>
  )
}
