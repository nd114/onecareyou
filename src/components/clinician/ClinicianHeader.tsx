import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Heart, Menu, X, ChevronDown, Users, Bell, Settings, LayoutDashboard, FileText, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { useClinicianNotifications } from '@/hooks/useClinicianNotifications';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export function ClinicianHeader() {
  const { user, signOut } = useAuth();
  const { clinicianProfile } = useClinicianProfile();
  const { notifications } = useClinicianNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreadCount = notifications?.filter(n => !n.is_read).length || 0;

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/');
  };

  const displayName = clinicianProfile?.title 
    ? `${clinicianProfile.title}` 
    : user?.email?.split('@')[0] || 'Clinician';

  const initials = displayName.slice(0, 2).toUpperCase();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  const managementLinks = [
    { to: '/clinician', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/clinician/patients', label: 'Patients', icon: Users },
    { to: '/clinician/guidance', label: 'Guidance', icon: FileText },
    { to: '/clinician/alerts', label: 'Alerts', icon: Bell },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link to="/clinician" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
            <Heart className="h-5 w-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-xl font-bold">Marpe</span>
            <span className="text-[10px] text-muted-foreground -mt-1">for Clinicians</span>
          </div>
        </Link>

        {/* Desktop Navigation - Tabs */}
        <nav className="hidden md:flex items-center gap-1">
          {managementLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <Button 
                variant="ghost" 
                className={`flex items-center gap-2 ${isActive(link.to) ? 'bg-muted' : ''}`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
                {link.label === 'Alerts' && unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </Badge>
                )}
              </Button>
            </Link>
          ))}
          
          <Link to="/clinician/pricing">
            <Button 
              variant="ghost" 
              className={isActive('/clinician/pricing') ? 'bg-muted' : ''}
            >
              Pricing
            </Button>
          </Link>
        </nav>

        {/* Right Side - Profile */}
        <div className="flex items-center gap-2">
          {/* Desktop Profile Dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={clinicianProfile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline text-sm font-medium">{displayName}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/clinician/settings" className="flex items-center gap-2 cursor-pointer">
                    <Settings className="h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/clinician/why-marpe" className="flex items-center gap-2 cursor-pointer">
                    <Heart className="h-4 w-4" />
                    Why Marpe?
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleSignOut}
                  className="flex items-center gap-2 cursor-pointer text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container py-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground px-2 mb-2">Management</p>
            {managementLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-2 py-2 rounded-md transition-colors ${
                  isActive(link.to) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
                {link.label === 'Alerts' && unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-auto h-5 px-1.5 text-xs">
                    {unreadCount}
                  </Badge>
                )}
              </Link>
            ))}
            
            <div className="border-t border-border my-3" />
            
            <Link
              to="/clinician/pricing"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-muted-foreground hover:bg-muted/50"
            >
              Pricing
            </Link>
            <Link
              to="/clinician/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-muted-foreground hover:bg-muted/50"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              to="/clinician/why-marpe"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-muted-foreground hover:bg-muted/50"
            >
              <Heart className="h-4 w-4" />
              Why Marpe?
            </Link>
            
            <div className="border-t border-border my-3" />
            
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                handleSignOut();
              }}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-destructive hover:bg-destructive/10 w-full"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}
