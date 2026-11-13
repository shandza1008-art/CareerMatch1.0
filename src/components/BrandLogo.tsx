interface BrandLogoProps {
  size?: 'sm' | 'md';
}

export function BrandLogo({ size = 'md' }: BrandLogoProps) {
  const iconSize = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const textSize = size === 'sm' ? 'text-base' : 'text-lg';

  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={iconSize}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="cmTealGloss" x1="18" y1="0" x2="18" y2="36" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FBFBFB" />
            <stop offset="26%" stopColor="#1EA8A9" />
            <stop offset="48%" stopColor="#198F90" />
            <stop offset="63%" stopColor="#20B4B6" />
            <stop offset="100%" stopColor="#EDEDED" />
          </linearGradient>
        </defs>
        <rect width="36" height="36" rx="10" className="fill-[#071E26] dark:fill-[#0A2B33]" />
        <rect x="0.75" y="0.75" width="34.5" height="34.5" rx="9.25" stroke="url(#cmTealGloss)" strokeOpacity="0.85" strokeWidth="1.25" />
        {/* Briefcase / Profile frame */}
        <path
          d="M14 11.5C14 10.3954 14.8954 9.5 16 9.5H20C21.1046 9.5 22 10.3954 22 11.5V13.5H14V11.5Z"
          stroke="#8BE0E1"
          strokeWidth="1.75"
        />
        <rect
          x="8.5"
          y="13.5"
          width="19"
          height="13.5"
          rx="3"
          className="stroke-white"
          strokeWidth="1.85"
        />
        {/* Integrated match checkmark in signature aqua-teal */}
        <path
          d="M13.5 20.5L16.5 23.25L22.75 17"
          stroke="#20B4B6"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={`${textSize} font-bold tracking-tight text-slate-900 dark:text-white font-display`}>
        Career<span className="text-[#198F90] dark:text-[#20B4B6]">Match</span>
      </span>
    </span>
  );
}
