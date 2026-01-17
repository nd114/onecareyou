import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFamilyMembers } from '@/hooks/useFamilyMembers';
import { Loader2, Plus, X } from 'lucide-react';
import { COMMON_ALLERGIES, COMMON_CONDITIONS, BLOOD_TYPES } from '@/types/health';

interface AddFamilyMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const RELATIONSHIPS = [
  { value: 'spouse', label: 'Spouse/Partner' },
  { value: 'child', label: 'Child' },
  { value: 'parent', label: 'Parent' },
  { value: 'sibling', label: 'Sibling' },
  { value: 'grandparent', label: 'Grandparent' },
  { value: 'grandchild', label: 'Grandchild' },
  { value: 'other', label: 'Other' },
];

const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];

export const AddFamilyMemberDialog = ({ open, onOpenChange }: AddFamilyMemberDialogProps) => {
  const { createMember, avatarColors, familyMembers } = useFamilyMembers();
  const [formData, setFormData] = useState({
    name: '',
    relationship: '',
    date_of_birth: '',
    gender: '',
    blood_type: '',
    height: '',
    allergies: [] as string[],
    health_conditions: [] as string[],
    avatar_color: avatarColors[familyMembers.length % avatarColors.length],
  });
  const [customAllergy, setCustomAllergy] = useState('');
  const [customCondition, setCustomCondition] = useState('');

  const handleSubmit = () => {
    if (!formData.name.trim()) return;

    createMember.mutate({
      name: formData.name,
      relationship: formData.relationship || undefined,
      date_of_birth: formData.date_of_birth || undefined,
      gender: formData.gender || undefined,
      blood_type: formData.blood_type || undefined,
      height: formData.height ? parseInt(formData.height) : undefined,
      allergies: formData.allergies,
      health_conditions: formData.health_conditions,
      avatar_color: formData.avatar_color,
    }, {
      onSuccess: () => {
        onOpenChange(false);
        setFormData({
          name: '',
          relationship: '',
          date_of_birth: '',
          gender: '',
          blood_type: '',
          height: '',
          allergies: [],
          health_conditions: [],
          avatar_color: avatarColors[(familyMembers.length + 1) % avatarColors.length],
        });
      },
    });
  };

  const toggleAllergy = (allergy: string) => {
    setFormData(prev => ({
      ...prev,
      allergies: prev.allergies.includes(allergy)
        ? prev.allergies.filter(a => a !== allergy)
        : [...prev.allergies, allergy],
    }));
  };

  const toggleCondition = (condition: string) => {
    setFormData(prev => ({
      ...prev,
      health_conditions: prev.health_conditions.includes(condition)
        ? prev.health_conditions.filter(c => c !== condition)
        : [...prev.health_conditions, condition],
    }));
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim() && !formData.allergies.includes(customAllergy.trim())) {
      setFormData(prev => ({
        ...prev,
        allergies: [...prev.allergies, customAllergy.trim()],
      }));
      setCustomAllergy('');
    }
  };

  const addCustomCondition = () => {
    if (customCondition.trim() && !formData.health_conditions.includes(customCondition.trim())) {
      setFormData(prev => ({
        ...prev,
        health_conditions: [...prev.health_conditions, customCondition.trim()],
      }));
      setCustomCondition('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Family Member</DialogTitle>
          <DialogDescription>
            Add a family member to manage their health information
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-4">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="Enter name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            />
          </div>

          {/* Relationship & Gender */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Relationship</Label>
              <Select
                value={formData.relationship}
                onValueChange={(value) => setFormData({ ...formData, relationship: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {RELATIONSHIPS.map(rel => (
                    <SelectItem key={rel.value} value={rel.value}>
                      {rel.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Gender</Label>
              <Select
                value={formData.gender}
                onValueChange={(value) => setFormData({ ...formData, gender: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map(gender => (
                    <SelectItem key={gender} value={gender}>
                      {gender}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* DOB & Blood Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth</Label>
              <Input
                id="dob"
                type="date"
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Blood Type</Label>
              <Select
                value={formData.blood_type}
                onValueChange={(value) => setFormData({ ...formData, blood_type: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {BLOOD_TYPES.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Height */}
          <div className="space-y-2">
            <Label htmlFor="height">Height (cm)</Label>
            <Input
              id="height"
              type="number"
              placeholder="e.g., 170"
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: e.target.value })}
            />
          </div>

          {/* Avatar Color */}
          <div className="space-y-2">
            <Label>Avatar Color</Label>
            <div className="flex flex-wrap gap-2">
              {avatarColors.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`h-8 w-8 rounded-full transition-transform ${
                    formData.avatar_color === color ? 'ring-2 ring-primary ring-offset-2 scale-110' : ''
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setFormData({ ...formData, avatar_color: color })}
                />
              ))}
            </div>
          </div>

          {/* Allergies */}
          <div className="space-y-2">
            <Label>Allergies</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {COMMON_ALLERGIES.map(allergy => (
                <Badge
                  key={allergy}
                  variant={formData.allergies.includes(allergy) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleAllergy(allergy)}
                >
                  {allergy}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add custom allergy"
                value={customAllergy}
                onChange={(e) => setCustomAllergy(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomAllergy())}
              />
              <Button type="button" variant="outline" size="icon" onClick={addCustomAllergy}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.allergies.filter(a => !COMMON_ALLERGIES.includes(a)).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.allergies.filter(a => !COMMON_ALLERGIES.includes(a)).map(allergy => (
                  <Badge key={allergy} variant="secondary" className="gap-1">
                    {allergy}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => toggleAllergy(allergy)} 
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Health Conditions */}
          <div className="space-y-2">
            <Label>Health Conditions</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {COMMON_CONDITIONS.map(condition => (
                <Badge
                  key={condition}
                  variant={formData.health_conditions.includes(condition) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleCondition(condition)}
                >
                  {condition}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add custom condition"
                value={customCondition}
                onChange={(e) => setCustomCondition(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomCondition())}
              />
              <Button type="button" variant="outline" size="icon" onClick={addCustomCondition}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {formData.health_conditions.filter(c => !COMMON_CONDITIONS.includes(c)).length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {formData.health_conditions.filter(c => !COMMON_CONDITIONS.includes(c)).map(condition => (
                  <Badge key={condition} variant="secondary" className="gap-1">
                    {condition}
                    <X 
                      className="h-3 w-3 cursor-pointer" 
                      onClick={() => toggleCondition(condition)} 
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              className="flex-1 gradient-primary border-0" 
              onClick={handleSubmit}
              disabled={!formData.name.trim() || createMember.isPending}
            >
              {createMember.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Member'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
