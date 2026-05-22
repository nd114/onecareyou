import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Heart,
  Menu,
  X,
  User,
  LogOut,
  Settings,
  Bell,
  Loader2,
  Stethoscope,
  UserPlus,
  Inbox,
  TrendingUp,
  BookOpen,
  CheckCircle,
  Eye,
  Clock,
  XCircle,
  Sun,
  Moon,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { usePatientGuidance } from "@/hooks/usePatientGuidance";
import { useClinicianNotifications } from "@/hooks/useClinicianNotifications";
import { toast } from "sonner";
import { format } from "date-fns";
import { HeaderFamilySwitcher } from "@/components/family/HeaderFamilySwitcher";
import { OfflineBanner } from "@/components/layout/OfflineBanner";
import { PATIENT_PILLARS, getPatientPillarForRoute } from "@/lib/nav-ia";

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut, loading } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { isClinician, clinicianProfile } = useClinicianProfile();
  const { guidance } = usePatientGuidance();
  const {
    unreadNotifications: clinicianNotifications,
    unreadCount: clinicianUnreadCount,
    markAsRead,
    markAllAsRead,
  } = useClinicianNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [expandedPillar, setExpandedPillar] = useState<string | null>(null);

  const toggleTheme = () => {
    setTheme(resolvedTheme === 'light' ? 'dark' : 'light');
  };

  const isAuthenticated = !!user;
  const userName = profile?.name || user?.email?.split("@")[0] || "User";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const subscriptionTier = (profile?.subscription_tier || "free") as string;
  void subscriptionTier;

  // Get avatar URL - for patients from profile, for clinicians from clinician profile
  const avatarUrl = isClinician ? clinicianProfile?.avatar_url : profile?.avatar_url;

  // Get unread notifications for patients (guidance items that haven't been acknowledged)
  const unreadGuidance = !isClinician ? guidance.filter((g) => g.status === "pending" || g.status === "sent") : [];
  // For clinicians, use clinician notifications
  const hasUnreadNotifications = isClinician ? clinicianUnreadCount > 0 : unreadGuidance.length > 0;
  const notificationCount = isClinician ? clinicianUnreadCount : unreadGuidance.length;

  // Helper to get icon for notification type
  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />;
      case "acknowledged":
        return <Eye className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />;
      case "expired":
        return <Clock className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />;
      case "dismissed":
        return <XCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />;
      default:
        return <Inbox className="h-4 w-4 text-primary mt-0.5 shrink-0" />;
    }
  };

  // Helper to get notification message
  const getNotificationMessage = (type: string, patientName: string | null | undefined) => {
    const name = patientName || "Patient";
    switch (type) {
      case "completed":
        return `${name} completed your guidance`;
      case "acknowledged":
        return `${name} acknowledged your guidance`;
      case "expired":
        return `Guidance for ${name} has expired`;
      case "dismissed":
        return `${name} dismissed your guidance`;
      default:
        return `Update from ${name}`;
    }
  };

  // Navigation IA v2 — 4 pillars for authenticated patients.
  // Clinicians use ClinicianHeader exclusively.
  const activePillar = isAuthenticated ? getPatientPillarForRoute(location.pathname) : null;
  const navLinks = isAuthenticated
    ? PATIENT_PILLARS.map((p) => ({ href: p.primary, label: p.label, pillarKey: p.key }))
    : [
        { href: "/", label: "Home", pillarKey: undefined as string | undefined },
        { href: "/about", label: "About", pillarKey: undefined },
        { href: "/features", label: "Features", pillarKey: undefined },
        { href: "/pricing", label: "Pricing", pillarKey: undefined },
        { href: "/contact", label: "Contact", pillarKey: undefined },
      ];

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 overflow-x-hidden">
      {isAuthenticated && !isClinician && <OfflineBanner />}
      <div className="container max-w-screen-2xl grid h-16 items-center gap-3 lg:gap-5 grid-cols-[auto_1fr_auto]">
        {/* Logo - sized to content so it never gets clipped */}
        <div className="flex justify-start shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <motion.div whileHover={{ scale: 1.05 }} className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
                <Heart className="h-5 w-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold text-foreground">OneCare</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide">Beta</span>
            </motion.div>
          </Link>
        </div>

        {/* Desktop Navigation - true page-centered via grid middle column */}
        <nav className="hidden lg:flex items-center justify-center gap-2 xl:gap-5 min-w-0 overflow-x-auto scrollbar-none">
          {navLinks.map((link) => {
            const isActive = link.pillarKey
              ? activePillar === link.pillarKey
              : location.pathname === link.href;
            return (
              <Link
                key={link.href}
                to={link.href}
                className={`text-[13px] xl:text-sm font-medium transition-colors hover:text-foreground whitespace-nowrap ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right column: contains both the md+ action cluster and the <lg hamburger */}
        <div className="flex items-center justify-end gap-2 shrink-0">

        {/* Right-side cluster: visible from md+ */}
        <div className="hidden md:flex items-center justify-end gap-2 shrink-0">




          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : isAuthenticated ? (
            <>
              {!isClinician && <HeaderFamilySwitcher />}
              <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5" />
                    {hasUnreadNotifications && (
                      <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                        {notificationCount > 9 ? "9+" : notificationCount}
                      </span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80 p-0">
                  <div className="p-3 border-b flex items-center justify-between">
                    <h4 className="font-medium text-sm">Notifications</h4>
                    {isClinician && clinicianUnreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-7 px-2"
                        onClick={() => markAllAsRead.mutate()}
                      >
                        Mark all read
                      </Button>
                    )}
                  </div>
                  {isClinician ? (
                    // Clinician notifications
                    clinicianNotifications.length > 0 ? (
                      <ScrollArea className="max-h-80">
                        <div className="divide-y">
                          {clinicianNotifications.slice(0, 10).map((notification) => (
                            <div
                              key={notification.id}
                              onClick={() => {
                                markAsRead.mutate(notification.id);
                                setNotificationsOpen(false);
                                navigate("/clinician/dashboard");
                              }}
                              className="block p-3 hover:bg-muted/50 transition-colors cursor-pointer"
                            >
                              <div className="flex items-start gap-2">
                                {getNotificationIcon(notification.notification_type)}
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm truncate">
                                    {notification.guidance?.title || "Guidance Update"}
                                  </p>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {getNotificationMessage(
                                      notification.notification_type,
                                      notification.patient_profile?.name,
                                    )}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                      {notification.notification_type}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground">
                                      {format(new Date(notification.created_at), "MMM d, h:mm a")}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    ) : (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No new notifications</p>
                        <p className="text-xs mt-1">You'll be notified when patients respond to your guidance</p>
                      </div>
                    )
                  ) : // Patient notifications
                  unreadGuidance.length > 0 ? (
                    <ScrollArea className="max-h-80">
                      <div className="divide-y">
                        {unreadGuidance.slice(0, 10).map((item) => (
                          <Link
                            key={item.id}
                            to="/guidance"
                            onClick={() => setNotificationsOpen(false)}
                            className="block p-3 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              <Inbox className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{item.title}</p>
                                <p className="text-xs text-muted-foreground line-clamp-2">{item.instruction}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {item.category}
                                  </Badge>
                                  <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(item.created_at), "MMM d, h:mm a")}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="text-center py-6 text-muted-foreground text-sm">
                      <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>No new notifications</p>
                      <p className="text-xs mt-1">We'll notify you about medication reminders and updates</p>
                    </div>
                  )}
                  {!isClinician && unreadGuidance.length > 0 && (
                    <div className="p-2 border-t">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full text-primary"
                        onClick={() => {
                          setNotificationsOpen(false);
                          navigate("/guidance");
                        }}
                      >
                        View all instructions
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {userInitials || <User className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium max-w-[120px] truncate hidden xl:inline">{userName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {/* Patient avatar menu — account-level only (pillars handle product nav) */}
                  {!isClinician && (
                    <>
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
                      <DropdownMenuItem asChild>
                        <Link to="/clinician/settings" className="flex items-center gap-2">
                          <Settings className="h-4 w-4" />
                          Settings
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
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                aria-label="Toggle theme"
              >
                {resolvedTheme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
              <Button variant="ghost" asChild>
                <Link to="/sign-in">Sign In</Link>
              </Button>
              <Button asChild className="gradient-primary border-0">
                <Link to="/sign-up">Get Started</Link>
              </Button>
            </>
          )}
        </div>

        {/* Hamburger: shown whenever the full desktop nav is hidden (below lg).
            On mobile (below md) also includes compact family switcher since the
            right-side cluster is hidden there. */}
        <div className="lg:hidden flex items-center gap-1.5 ml-auto">
          {isAuthenticated && !isClinician && <div className="md:hidden"><HeaderFamilySwitcher compact /></div>}
          <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle navigation">
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
        </div>

      </div>


      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:hidden border-t border-border bg-background"
        >

          <nav className="container py-4 flex flex-col gap-1">
            {isAuthenticated && !isClinician ? (
              <>
                {PATIENT_PILLARS.map((pillar) => (
                  <div key={pillar.key} className="pb-2">
                    <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {pillar.label}
                    </p>
                    {pillar.tabs.map((tab) => (
                      <Link
                        key={tab.to}
                        to={tab.to}
                        className={`block px-4 py-2 text-sm font-medium rounded-lg ${
                          location.pathname === tab.to
                            ? "text-primary bg-primary/5"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                        }`}
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {tab.label}
                      </Link>
                    ))}
                  </div>
                ))}
                <div className="border-t border-border my-2" />
                <Link
                  to="/settings"
                  className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Settings
                </Link>
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
            ) : isAuthenticated ? (
              <>
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`px-4 py-2 text-sm font-medium hover:bg-muted rounded-lg ${
                      location.pathname === link.href
                        ? "text-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
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
              <div className="flex flex-col gap-2 mt-2 px-4">
                <Button
                  variant="outline"
                  onClick={toggleTheme}
                  className="w-full justify-start"
                >
                  {resolvedTheme === 'dark' ? (
                    <>
                      <Sun className="h-4 w-4 mr-2" />
                      Light Mode
                    </>
                  ) : (
                    <>
                      <Moon className="h-4 w-4 mr-2" />
                      Dark Mode
                    </>
                  )}
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" asChild className="flex-1">
                    <Link to="/sign-in">Sign In</Link>
                  </Button>
                  <Button asChild className="flex-1 gradient-primary border-0">
                    <Link to="/sign-up">Get Started</Link>
                  </Button>
                </div>
              </div>
            )}
          </nav>
        </motion.div>
      )}
    </header>
  );
}
