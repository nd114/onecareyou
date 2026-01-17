import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Heart, Menu, X, User, LogOut, Settings, Bell, Loader2, Pill, Activity, Users, Stethoscope, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClinicianProfile } from '@/hooks/useClinicianProfile';
import { toast } from 'sonner';

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut, loading } = useAuth();
  const { isClinician } = useClinicianProfile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  
  const isAuthenticated = !!user;
  const userName = profile?.name || user?.email?.split('@')[0] || 'User';
  const subscriptionTier = (profile?.subscription_tier || 'free') as string;
  const hasFamilyAccess = subscriptionTier === 'family' || subscriptionTier === 'premium';
  
  // Clinicians get a simplified nav - they don't need patient features like medications/vitals in main nav
  const navLinks = isAuthenticated 
    ? isClinician
      ? [
          { href: '/clinician/dashboard', label: 'Dashboard' },
        ]
      : [
          { href: '/dashboard', label: 'Dashboard' },
          { href: '/medications', label: 'Medications' },
          { href: '/schedule', label: 'Schedule' },
          { href: '/vitals', label: 'Vitals' },
        ]
    : [
        { href: '/features', label: 'Features' },
        { href: '/pricing', label: 'Pricing' },
        { href: '/about', label: 'About' },
        { href: '/contact', label: 'Contact' },
      ];

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out successfully');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-2"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
              <Heart className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold text-foreground">
              OneCare
            </span>
          </motion.div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`text-sm font-medium transition-colors hover:text-foreground ${
                location.pathname === link.href 
                  ? 'text-primary' 
                  : 'text-muted-foreground'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Desktop Auth Buttons / User Menu */}
        <div className="hidden md:flex items-center gap-3">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isAuthenticated ? (
            <>
              <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-3">
                    <h4 className="font-medium text-sm">Notifications</h4>
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No new notifications</p>
                      <p className="text-xs mt-1">We'll notify you about medication reminders and updates</p>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-medium max-w-[120px] truncate">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Patient-only menu items */}
                  {!isClinician && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/medications" className="flex items-center gap-2">
                          <Pill className="h-4 w-4" />
                          Medications
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/vitals" className="flex items-center gap-2">
                          <Activity className="h-4 w-4" />
                          Vitals
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/care-circle" className="flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Care Circle
                        </Link>
                      </DropdownMenuItem>
                      {hasFamilyAccess && (
                        <DropdownMenuItem asChild>
                          <Link to="/family" className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            Family Dashboard
                          </Link>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild>
                        <Link to="/onboarding" className="flex items-center gap-2">
                          <Heart className="h-4 w-4" />
                          Health Profile
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link to="/settings" className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Settings
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  {/* Clinician-only menu items */}
                  {isClinician && (
                    <>
                      <DropdownMenuItem asChild>
                        <Link to="/clinician/dashboard" className="flex items-center gap-2">
                          <Stethoscope className="h-4 w-4" />
                          Clinician Dashboard
                        </Link>
                      </DropdownMenuItem>
                    </>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-destructive cursor-pointer">
                    <LogOut className="h-4 w-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" asChild>
                <Link to="/sign-in">Sign In</Link>
              </Button>
              <Button asChild className="gradient-primary border-0">
                <Link to="/sign-up">Get Started</Link>
              </Button>
            </>
          )}
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

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden border-t border-border bg-background"
        >
          <nav className="container py-4 flex flex-col gap-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className={`px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg ${
                  location.pathname === link.href 
                    ? 'text-primary bg-primary/5' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <>
                {/* Patient-only mobile menu items */}
                {!isClinician && (
                  <>
                    <Link
                      to="/care-circle"
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Care Circle
                    </Link>
                    {hasFamilyAccess && (
                      <Link
                        to="/family"
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        Family Dashboard
                      </Link>
                    )}
                    <Link
                      to="/onboarding"
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Health Profile
                    </Link>
                    <Link
                      to="/settings"
                      className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Settings
                    </Link>
                  </>
                )}
                {/* Clinician mobile menu items */}
                {isClinician && (
                  <>
                    <Link
                      to="/clinician/dashboard"
                      className="px-4 py-2 text-sm font-medium text-primary hover:text-foreground hover:bg-muted rounded-lg flex items-center gap-2"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <Stethoscope className="h-4 w-4" />
                      Clinician Dashboard
                    </Link>
                  </>
                )}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleSignOut();
                  }}
                  className="px-4 py-2 text-sm font-medium text-destructive hover:bg-muted rounded-lg text-left"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-2 mt-2 px-4">
                <Button variant="outline" asChild className="flex-1">
                  <Link to="/sign-in">Sign In</Link>
                </Button>
                <Button asChild className="flex-1 gradient-primary border-0">
                  <Link to="/sign-up">Get Started</Link>
                </Button>
              </div>
            )}
          </nav>
        </motion.div>
      )}
    </header>
  );
}
