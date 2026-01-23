import { useState } from "react";
import { Settings2, Link2, TestTube, Loader2, CheckCircle, AlertCircle, Server, Key, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface EHRConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: {
    id: string;
    provider_type: string;
    provider_name: string;
    fhir_base_url: string | null;
    sync_status: string;
  } | null;
  onConnectionUpdated: () => void;
}

export function EHRConfigDialog({ open, onOpenChange, connection, onConnectionUpdated }: EHRConfigDialogProps) {
  const { session } = useAuth();
  const [fhirUrl, setFhirUrl] = useState(connection?.fhir_base_url || "");
  const [accessToken, setAccessToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleTestConnection = async () => {
    if (!fhirUrl.trim()) {
      toast.error("Please enter a FHIR server URL");
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("ehr-sync", {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: {
          action: "test_connection",
          connectionId: connection?.id,
          fhirBaseUrl: fhirUrl.trim(),
          accessToken: accessToken.trim() || undefined,
        },
      });

      if (error) throw error;

      if (data.success) {
        setTestResult({
          success: true,
          message: `Connected! FHIR ${data.fhirVersion}${data.software ? ` - ${data.software}` : ""}`,
        });
        onConnectionUpdated();
        toast.success("FHIR connection successful");
      } else {
        throw new Error(data.error || "Connection failed");
      }
    } catch (error: any) {
      setTestResult({ success: false, message: error.message });
      toast.error("Connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const getProviderInstructions = () => {
    switch (connection?.provider_type) {
      case "veradigm":
        return {
          title: "Veradigm (Vericlaim) Setup",
          steps: [
            "Log into your Veradigm Practice Management portal",
            "Navigate to Settings → API & Integrations",
            "Enable SMART on FHIR access and register Marpe as an application",
            "Copy the FHIR Base URL and OAuth credentials",
            "Enter the FHIR URL below and authenticate",
          ],
          docsUrl: "https://developer.veradigm.com/fhir",
        };
      case "healthbridge":
        return {
          title: "HealthBridge Clinical Setup",
          steps: [
            "Contact your HealthBridge administrator for API access",
            "Request a JWT service account token for FHIR R4 access",
            "Obtain the FHIR Base URL for your practice",
            "Enter credentials below and test the connection",
          ],
          docsUrl: null,
        };
      case "fhir_generic":
        return {
          title: "Generic FHIR R4 Server",
          steps: [
            "Ensure your EHR supports FHIR R4 (4.0.1 or later)",
            "Obtain the FHIR server base URL",
            "If authentication is required, obtain an access token",
            "Test the connection to verify compatibility",
          ],
          docsUrl: "https://www.hl7.org/fhir/",
        };
      default:
        return null;
    }
  };

  const instructions = getProviderInstructions();

  if (!connection) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            Configure {connection.provider_name}
          </DialogTitle>
          <DialogDescription>Set up the FHIR connection to sync patient data with your EHR</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="setup">Connection Setup</TabsTrigger>
            <TabsTrigger value="help">Setup Guide</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="space-y-4 pt-4">
            {/* FHIR URL Input */}
            <div className="space-y-2">
              <Label htmlFor="fhir-url" className="flex items-center gap-2">
                <Server className="h-4 w-4" />
                FHIR Server URL
              </Label>
              <Input
                id="fhir-url"
                placeholder="https://fhir.example.com/r4"
                value={fhirUrl}
                onChange={(e) => setFhirUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The base URL of your FHIR R4 server (without trailing slash)
              </p>
            </div>

            {/* Access Token Input */}
            <div className="space-y-2">
              <Label htmlFor="access-token" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Access Token (Optional)
              </Label>
              <Input
                id="access-token"
                type="password"
                placeholder="Bearer token or API key"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Required if your FHIR server uses authentication</p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div
                className={`p-3 rounded-lg border ${
                  testResult.success ? "bg-green-500/10 border-green-500/20" : "bg-destructive/10 border-destructive/20"
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span
                    className={`text-sm font-medium ${
                      testResult.success ? "text-green-700 dark:text-green-400" : "text-destructive"
                    }`}
                  >
                    {testResult.message}
                  </span>
                </div>
              </div>
            )}

            {/* Test Connection Button */}
            <Button onClick={handleTestConnection} disabled={testing || !fhirUrl.trim()} className="w-full">
              {testing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing Connection...
                </>
              ) : (
                <>
                  <TestTube className="h-4 w-4 mr-2" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Current Status */}
            <div className="pt-2 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Connection Status:</span>
                <Badge
                  variant={
                    connection.sync_status === "active"
                      ? "default"
                      : connection.sync_status === "error"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {connection.sync_status === "active"
                    ? "Connected"
                    : connection.sync_status === "error"
                      ? "Error"
                      : "Pending Setup"}
                </Badge>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="help" className="space-y-4 pt-4">
            {instructions ? (
              <>
                <h3 className="font-medium">{instructions.title}</h3>
                <ol className="space-y-2 text-sm">
                  {instructions.steps.map((step, idx) => (
                    <li key={idx} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-medium">
                        {idx + 1}
                      </span>
                      <span className="text-muted-foreground pt-0.5">{step}</span>
                    </li>
                  ))}
                </ol>
                {instructions.docsUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={instructions.docsUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      View Documentation
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No specific setup guide available for this provider.</p>
                <p className="text-sm mt-2">Enter your FHIR server URL and test the connection.</p>
              </div>
            )}

            {/* HIPAA Notice */}
            <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20 mt-4">
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">HIPAA Compliance Notice</p>
              <p className="text-xs text-muted-foreground mt-1">
                EHR integrations are available for Enterprise tier subscribers with a signed BAA. All data transfers are
                encrypted and logged for compliance.
              </p>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
