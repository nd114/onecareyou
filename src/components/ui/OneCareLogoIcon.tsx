import { Heart } from 'lucide-react';

interface OneCareLogoIconProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: 'h-5 w-5',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
};

export function OneCareLogoIcon({ className = '', size = 'md' }: OneCareLogoIconProps) {
  return (
    <div className={`flex items-center justify-center rounded-lg gradient-primary ${sizeMap[size]} ${className}`}>
      <Heart className="h-3/5 w-3/5 text-primary-foreground" />
    </div>
  );
}
