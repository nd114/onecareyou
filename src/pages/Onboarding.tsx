import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Heart, Calendar, Droplet, Ruler, X, Plus, ArrowRight, SkipForward, Loader2 } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { COMMON_ALLERGIES, COMMON_CONDITIONS, BLOOD_TYPES } from "@/types/health";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

const genderOptions = ["Male", "Female", "Other", "Prefer not to say"];

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, refreshProfile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    dateOfBirth: "",
    gender: "",
    bloodType: "",
    height: "",
    allergies: [] as string[],
    healthConditions: [] as string[],
    customAllergy: "",
    customCondition: "",
  });

  // Pre-populate form if profile exists
  useEffect(() => {
    if (profile) {
      setFormData({
        dateOfBirth: profile.date_of_birth || "",
        gender: profile.gender || "",
        bloodType: profile.blood_type || "",
        height: profile.height?.toString() || "",
        allergies: (profile.allergies as string[]) || [],
        healthConditions: (profile.health_conditions as string[]) || [],
        customAllergy: "",
        customCondition: "",
      });
    }
  }, [profile]);

  const toggleAllergy = (allergy: string) => {
    setFormData((prev) => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter((a) => a !== allergy)
        : [...prev.allergies, allergy],
    }));
  };

  const toggleCondition = (condition: string) => {
    setFormData((prev) => ({
      ...prev,
      healthConditions: prev.healthConditions.includes(condition)
        ? prev.healthConditions.filter((c) => c !== condition)
        : [...prev.healthConditions, condition],
    }));
  };

  const addCustomAllergy = () => {
    if (formData.customAllergy.trim() && !formData.allergies.includes(formData.customAllergy.trim())) {
      setFormData((prev) => ({
        ...prev,
        allergies: [...prev.allergies, prev.customAllergy.trim()],
        customAllergy: "",
      }));
    }
  };

  const addCustomCondition = () => {
    if (formData.customCondition.trim() && !formData.healthConditions.includes(formData.customCondition.trim())) {
      setFormData((prev) => ({
        ...prev,
        healthConditions: [...prev.healthConditions, prev.customCondition.trim()],
        customCondition: "",
      }));
    }
  };

  const saveProfile = async (markComplete: boolean = true) => {
    if (!user) return;

    setIsLoading(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        date_of_birth: formData.dateOfBirth || null,
        gender: formData.gender || null,
        blood_type: formData.bloodType || null,
        height: formData.height ? parseInt(formData.height) : null,
        allergies: formData.allergies,
        health_conditions: formData.healthConditions,
        onboarding_completed: markComplete,
      })
      .eq("user_id", user.id);

    if (error) {
      toast.error("Failed to save profile: " + error.message);
      setIsLoading(false);
      return false;
    }

    await refreshProfile();
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await saveProfile(true);
    if (success) {
      toast.success("Health profile saved! Welcome to OneCare.");
      navigate("/dashboard");
    }
    setIsLoading(false);
  };

  const handleSkip = async () => {
    const success = await saveProfile(true);
    if (success) {
      navigate("/dashboard");
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <div className="py-8 px-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary">
                <Heart className="h-6 w-6 text-primary-foreground" />
              </div>
            </div>
            <h1 className="font-display text-3xl font-bold mb-2">
              {profile?.onboarding_completed ? "Edit Your Health Profile" : "Let's Set Up Your Health Profile"}
            </h1>
            <p className="text-muted-foreground">
              This information helps us personalize your experience and check for relevant interactions.
            </p>
          </div>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Tell us about yourself (all fields are optional)</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-8">
                {/* Bio-data */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dob" className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      Date of Birth
                    </Label>
                    <Input
                      id="dob"
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select
                      value={formData.gender}
                      onValueChange={(value) => setFormData({ ...formData, gender: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select gender" />
                      </SelectTrigger>
                      <SelectContent>
                        {genderOptions.map((g) => (
                          <SelectItem key={g} value={g}>
                            {g}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Droplet className="h-4 w-4" />
                      Blood Type
                    </Label>
                    <Select
                      value={formData.bloodType}
                      onValueChange={(value) => setFormData({ ...formData, bloodType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select blood type" />
                      </SelectTrigger>
                      <SelectContent>
                        {BLOOD_TYPES.map((bt) => (
                          <SelectItem key={bt} value={bt}>
                            {bt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="height" className="flex items-center gap-2">
                      <Ruler className="h-4 w-4" />
                      Height (cm)
                    </Label>
                    <Input
                      id="height"
                      type="number"
                      placeholder="e.g., 175"
                      value={formData.height}
                      onChange={(e) => setFormData({ ...formData, height: e.target.value })}
                    />
                  </div>
                </div>

                {/* Allergies */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Known Allergies</Label>
                  <p className="text-sm text-muted-foreground -mt-2">
                    Click to select common allergies or add your own
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_ALLERGIES.map((allergy) => (
                      <Badge
                        key={allergy}
                        variant={formData.allergies.includes(allergy) ? "default" : "outline"}
                        className={`cursor-pointer transition-all ${
                          formData.allergies.includes(allergy)
                            ? "bg-primary hover:bg-primary/90"
                            : "hover:bg-primary/10"
                        }`}
                        onClick={() => toggleAllergy(allergy)}
                      >
                        {allergy}
                        {formData.allergies.includes(allergy) && <X className="h-3 w-3 ml-1" />}
                      </Badge>
                    ))}
                  </div>
                  {/* Show custom allergies */}
                  {formData.allergies.filter((a) => !COMMON_ALLERGIES.includes(a)).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.allergies
                        .filter((a) => !COMMON_ALLERGIES.includes(a))
                        .map((allergy) => (
                          <Badge
                            key={allergy}
                            className="cursor-pointer bg-primary hover:bg-primary/90"
                            onClick={() => toggleAllergy(allergy)}
                          >
                            {allergy}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add custom allergy"
                      value={formData.customAllergy}
                      onChange={(e) => setFormData({ ...formData, customAllergy: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomAllergy())}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addCustomAllergy}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Health Conditions */}
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Health Conditions</Label>
                  <p className="text-sm text-muted-foreground -mt-2">Select any conditions you're currently managing</p>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_CONDITIONS.map((condition) => (
                      <Badge
                        key={condition}
                        variant={formData.healthConditions.includes(condition) ? "default" : "outline"}
                        className={`cursor-pointer transition-all ${
                          formData.healthConditions.includes(condition)
                            ? "bg-primary hover:bg-primary/90"
                            : "hover:bg-primary/10"
                        }`}
                        onClick={() => toggleCondition(condition)}
                      >
                        {condition}
                        {formData.healthConditions.includes(condition) && <X className="h-3 w-3 ml-1" />}
                      </Badge>
                    ))}
                  </div>
                  {/* Show custom conditions */}
                  {formData.healthConditions.filter((c) => !COMMON_CONDITIONS.includes(c)).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.healthConditions
                        .filter((c) => !COMMON_CONDITIONS.includes(c))
                        .map((condition) => (
                          <Badge
                            key={condition}
                            className="cursor-pointer bg-primary hover:bg-primary/90"
                            onClick={() => toggleCondition(condition)}
                          >
                            {condition}
                            <X className="h-3 w-3 ml-1" />
                          </Badge>
                        ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add custom condition"
                      value={formData.customCondition}
                      onChange={(e) => setFormData({ ...formData, customCondition: e.target.value })}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomCondition())}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={addCustomCondition}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  {!profile?.onboarding_completed && (
                    <Button type="button" variant="ghost" onClick={handleSkip} disabled={isLoading} className="flex-1">
                      <SkipForward className="h-4 w-4 mr-2" />
                      Skip for Now
                    </Button>
                  )}
                  <Button
                    type="submit"
                    className={`gradient-primary border-0 ${profile?.onboarding_completed ? "w-full" : "flex-1"}`}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        {profile?.onboarding_completed ? "Save Changes" : "Complete Setup"}
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Onboarding;
