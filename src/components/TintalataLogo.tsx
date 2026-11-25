interface TintalataLogoProps {
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'light';
}

export function TintalataLogo({ size = 'md', variant = 'default' }: TintalataLogoProps) {
  const dims =
    size === 'sm' ? 'h-9 w-9' : size === 'lg' ? 'h-14 w-14' : 'h-11 w-11';
  const bg =
    variant === 'light'
      ? 'bg-white/15 border border-white/25 text-white'
      : 'bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-md shadow-blue-600/25';

  return (
    <div className={`${dims} ${bg} rounded-2xl flex items-center justify-center shrink-0`}>
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-[62%] w-[62%]"
        aria-hidden="true"
      >
        {/* Document sheet outline */}
        <path
          d="M8 5.5C8 4.39543 8.89543 3.5 10 3.5H20.5L27.5 10.5V29.5C27.5 30.6046 26.6046 31.5 25.5 31.5H10C8.89543 31.5 8 30.6046 8 29.5V5.5Z"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 3.5V10.5H27.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        {/* Stylus / ink stroke curve */}
        <path
          d="M12.5 17.5H22.5M12.5 22H18.5"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M12.5 26.5C15 25.2 17.5 28 20.5 26C22 25 23.2 25.5 24 26.5"
          stroke="#93C5FD"
          strokeWidth="2.3"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
