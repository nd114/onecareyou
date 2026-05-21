import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import {
  Heart,
  Menu,
  X,
  ChevronDown,
  Users,
  Bell,
  Settings,
  LayoutDashboard,
  FileText,
  LogOut,
  Moon,
  Sun,
  CheckCircle,
  Eye,
  Clock,
  XCircle,
  Inbox,
  AlertTriangle,
  MessageSquare,
  Mic,

  MoreHorizontal,
  Building2,
  Database,
  ShieldCheck,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useClinicianProfile } from "@/hooks/useClinicianProfile";
import { useClinicianNotifications } from "@/hooks/useClinicianNotifications";
import { usePractice } from "@/hooks/usePractice";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";

export function ClinicianHeader() {
  const { user, signOut } = useAuth();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { clinicianProfile } = useClinicianProfile();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useClinicianNotifications();
  const { myInvitations, acceptInvitation, declineInvitation } = usePractice();
  const pendingInviteCount = myInvitations?.length || 0;
  const totalBadgeCount = unreadCount + pendingInviteCount;
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const toggleTheme = () => {
    // Toggle between light and dark, defaulting from resolved if on system
    setTheme(resolvedTheme === "light" ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out successfully");
    navigate("/");
  };

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

  // Build display name from first_name/last_name or fall back to email
  const getDisplayName = () => {
    if (clinicianProfile?.first_name || clinicianProfile?.last_name) {
      const firstName = clinicianProfile.first_name || "";
      const lastName = clinicianProfile.last_name || "";
      const title = clinicianProfile.title || "";
      return `${title} ${firstName} ${lastName}`.trim();
    }
    return user?.email?.split("@")[0] || "Clinician";
  };

  const displayName = getDisplayName();

  // Get initials from first and last name
  const getInitials = () => {
    if (clinicianProfile?.first_name && clinicianProfile?.last_name) {
      return `${clinicianProfile.first_name.charAt(0)}${clinicianProfile.last_name.charAt(0)}`.toUpperCase();
    }
    if (clinicianProfile?.first_name) {
      return clinicianProfile.first_name.slice(0, 2).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  };

  const initials = getInitials();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  // Alert badge uses unreadCount from notifications
  const navLinks = [
    { to: "/clinician/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/clinician/patients", label: "Patients", icon: Users },
    { to: "/clinician/messages", label: "Messages", icon: MessageSquare },
    { to: "/clinician/guidance", label: "Guidance", icon: FileText },
    { to: "/clinician/dictations", label: "Dictations", icon: Mic },
    { to: "/clinician/alerts", label: "Alerts", icon: AlertTriangle },
  ];



  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center">
        {/* Logo - fixed width for symmetry */}
        <div className="flex-1 flex justify-start">
          <Link to="/clinician/dashboard" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl gradient-primary">
              <Heart className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col items-start">
              <span className="font-display text-xl font-bold">OneCare</span>
              <span className="text-[10px] text-muted-foreground -mt-1">for Clinicians</span>
            </div>
            <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 text-[10px] font-bold uppercase tracking-wide">Beta</span>
          </Link>
        </div>

        {/* Desktop Navigation - Tab Style - truly centered */}
        <nav className="hidden md:flex items-center justify-center gap-1">
          {navLinks.map((link) => (
            <Link key={link.to} to={link.to}>
              <Button
                variant="ghost"
                className={`relative ${
                  isActive(link.to) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <link.icon className="h-4 w-4 mr-2" />
                {link.label}
              </Button>
            </Link>
          ))}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-4 w-4 mr-2" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-56 bg-background border">
              <DropdownMenuItem asChild>
                <Link to="/clinician/settings#practice-team" className="flex items-center gap-2 cursor-pointer">
                  <Building2 className="h-4 w-4" />
                  Practice & Team
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/clinician/settings#ehr-connections" className="flex items-center gap-2 cursor-pointer">
                  <Database className="h-4 w-4" />
                  EHR Integrations
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/clinician/baa" className="flex items-center gap-2 cursor-pointer">
                  <ShieldCheck className="h-4 w-4" />
                  BAA
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/clinician/settings" className="flex items-center gap-2 cursor-pointer">
                  <Settings className="h-4 w-4" />
                  All Settings
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        {/* Right Side - Theme Toggle, Notifications Popover, Profile - fixed width for symmetry */}
        <div className="flex-1 flex items-center justify-end gap-1">
          {/* Theme Toggle Icon */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="hidden md:flex"
            aria-label="Toggle theme"
          >
            {resolvedTheme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>

          {/* Notification Bell - Popover with notifications */}
          <Popover open={notificationsOpen} onOpenChange={setNotificationsOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="hidden md:flex relative" aria-label="View notifications">
                <Bell className="h-5 w-5" />
                {totalBadgeCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
                    {totalBadgeCount > 9 ? "9+" : totalBadgeCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0">
              <div className="p-3 border-b flex items-center justify-between">
                <h4 className="font-medium text-sm">Notifications</h4>
                {unreadCount > 0 && (
                  <Button variant="ghost" size="sm" className="text-xs h-7 px-2" onClick={() => markAllAsRead.mutate()}>
                    Mark all read
                  </Button>
                )}
              </div>
              {pendingInviteCount > 0 && (
                <div className="border-b bg-primary/5">
                  <div className="px-3 pt-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-primary flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Practice Invitations
                  </div>
                  <div className="divide-y">
                    {myInvitations.map((inv) => (
                      <div key={inv.id} className="p-3">
                        <p className="text-sm font-medium">You've been invited to join a practice</p>
                        <p className="text-xs text-muted-foreground mb-2">
                          Role: <span className="capitalize">{inv.role}</span>
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => acceptInvitation.mutate(inv.id)}
                            disabled={acceptInvitation.isPending}
                          >
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            onClick={() => declineInvitation.mutate(inv.id)}
                            disabled={declineInvitation.isPending}
                          >
                            Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {notifications && notifications.length > 0 ? (
                <ScrollArea className="max-h-80">
                  <div className="divide-y">
                    {notifications.slice(0, 10).map((notification) => (
                      <div
                        key={notification.id}
                        onClick={() => {
                          if (!notification.is_read) {
                            markAsRead.mutate(notification.id);
                          }
                          setNotificationsOpen(false);
                          navigate("/clinician/patients");
                        }}
                        className={`block p-3 hover:bg-muted/50 transition-colors cursor-pointer ${
                          !notification.is_read ? "bg-muted/30" : ""
                        }`}
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
              )}
            </PopoverContent>
          </Popover>

          {/* Desktop Profile Dropdown */}
          <div className="hidden md:block">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={clinicianProfile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden lg:inline text-sm font-medium">{displayName}</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-background border">
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
                  <Link to="/clinician/why-onecare" className="flex items-center gap-2 cursor-pointer">
                    <Heart className="h-4 w-4" />
                    Why OneCare?
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
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <nav className="container py-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground px-2 mb-2">Navigation</p>
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-2 py-2 rounded-md transition-colors ${
                  isActive(link.to) ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <link.icon className="h-4 w-4" />
                {link.label}
              </Link>
            ))}

            <div className="border-t border-border my-3" />

            <Link
              to="/clinician/settings"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-muted-foreground hover:bg-muted/50"
            >
              <Settings className="h-4 w-4" />
              Settings
            </Link>
            <Link
              to="/clinician/why-onecare"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-2 py-2 rounded-md text-muted-foreground hover:bg-muted/50"
            >
              <Heart className="h-4 w-4" />
              Why OneCare?
            </Link>

            {/* Mobile Theme Toggle */}
            <div className="border-t border-border my-3" />
            <div className="flex items-center justify-between px-2 py-2">
              <span className="text-sm text-muted-foreground">Theme</span>
              <Button variant="ghost" size="sm" onClick={toggleTheme} className="flex items-center gap-2">
                {resolvedTheme === "dark" ? (
                  <>
                    <Sun className="h-4 w-4" />
                    Light
                  </>
                ) : (
                  <>
                    <Moon className="h-4 w-4" />
                    Dark
                  </>
                )}
              </Button>
            </div>

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
