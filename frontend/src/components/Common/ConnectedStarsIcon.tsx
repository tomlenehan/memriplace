import type { IconBaseProps } from "react-icons"

export default function ConnectedStarsIcon({ size = "1em", ...props }: IconBaseProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m10.5 8.5-3.7 5.7m6.7-5.7 3.7 5.7m-8.4 2h6.4" />
      <path d="m12 2.5 1.35 2.8 3.05.45-2.2 2.15.52 3.05L12 9.5l-2.72 1.45.52-3.05-2.2-2.15 3.05-.45L12 2.5Z" />
      <path d="m5.5 13.2.95 1.95 2.15.32-1.55 1.51.36 2.14-1.91-1.01-1.91 1.01.36-2.14-1.55-1.51 2.15-.32.95-1.95Z" />
      <path d="m18.5 13.2.95 1.95 2.15.32-1.55 1.51.36 2.14-1.91-1.01-1.91 1.01.36-2.14-1.55-1.51 2.15-.32.95-1.95Z" />
    </svg>
  )
}
