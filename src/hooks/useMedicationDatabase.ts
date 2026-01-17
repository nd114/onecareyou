import { useState, useMemo, useCallback } from 'react';

// Common medications database for autocomplete
// This is a curated list of common medications, vitamins, and supplements
const MEDICATION_DATABASE = [
  // Common Prescription Medications
  { name: 'Lisinopril', category: 'ACE Inhibitor', commonDosages: ['2.5mg', '5mg', '10mg', '20mg', '40mg'] },
  { name: 'Metformin', category: 'Diabetes', commonDosages: ['500mg', '850mg', '1000mg'] },
  { name: 'Atorvastatin', category: 'Statin', commonDosages: ['10mg', '20mg', '40mg', '80mg'] },
  { name: 'Amlodipine', category: 'Calcium Channel Blocker', commonDosages: ['2.5mg', '5mg', '10mg'] },
  { name: 'Metoprolol', category: 'Beta Blocker', commonDosages: ['25mg', '50mg', '100mg', '200mg'] },
  { name: 'Losartan', category: 'ARB', commonDosages: ['25mg', '50mg', '100mg'] },
  { name: 'Omeprazole', category: 'Proton Pump Inhibitor', commonDosages: ['10mg', '20mg', '40mg'] },
  { name: 'Simvastatin', category: 'Statin', commonDosages: ['5mg', '10mg', '20mg', '40mg'] },
  { name: 'Levothyroxine', category: 'Thyroid', commonDosages: ['25mcg', '50mcg', '75mcg', '100mcg', '125mcg'] },
  { name: 'Gabapentin', category: 'Anticonvulsant', commonDosages: ['100mg', '300mg', '400mg', '600mg', '800mg'] },
  { name: 'Hydrochlorothiazide', category: 'Diuretic', commonDosages: ['12.5mg', '25mg', '50mg'] },
  { name: 'Sertraline', category: 'SSRI', commonDosages: ['25mg', '50mg', '100mg'] },
  { name: 'Fluoxetine', category: 'SSRI', commonDosages: ['10mg', '20mg', '40mg', '60mg'] },
  { name: 'Escitalopram', category: 'SSRI', commonDosages: ['5mg', '10mg', '20mg'] },
  { name: 'Tramadol', category: 'Pain', commonDosages: ['50mg', '100mg'] },
  { name: 'Prednisone', category: 'Corticosteroid', commonDosages: ['1mg', '2.5mg', '5mg', '10mg', '20mg', '50mg'] },
  { name: 'Furosemide', category: 'Diuretic', commonDosages: ['20mg', '40mg', '80mg'] },
  { name: 'Pantoprazole', category: 'Proton Pump Inhibitor', commonDosages: ['20mg', '40mg'] },
  { name: 'Montelukast', category: 'Leukotriene Inhibitor', commonDosages: ['4mg', '5mg', '10mg'] },
  { name: 'Albuterol', category: 'Bronchodilator', commonDosages: ['2mg', '4mg', '90mcg/actuation'] },
  { name: 'Clopidogrel', category: 'Antiplatelet', commonDosages: ['75mg'] },
  { name: 'Warfarin', category: 'Anticoagulant', commonDosages: ['1mg', '2mg', '2.5mg', '3mg', '4mg', '5mg', '6mg', '7.5mg', '10mg'] },
  { name: 'Apixaban', category: 'Anticoagulant', commonDosages: ['2.5mg', '5mg'] },
  { name: 'Rivaroxaban', category: 'Anticoagulant', commonDosages: ['10mg', '15mg', '20mg'] },
  { name: 'Duloxetine', category: 'SNRI', commonDosages: ['20mg', '30mg', '60mg'] },
  { name: 'Venlafaxine', category: 'SNRI', commonDosages: ['37.5mg', '75mg', '150mg'] },
  { name: 'Bupropion', category: 'Antidepressant', commonDosages: ['75mg', '100mg', '150mg', '300mg'] },
  { name: 'Trazodone', category: 'Antidepressant', commonDosages: ['50mg', '100mg', '150mg'] },
  { name: 'Alprazolam', category: 'Benzodiazepine', commonDosages: ['0.25mg', '0.5mg', '1mg', '2mg'] },
  { name: 'Lorazepam', category: 'Benzodiazepine', commonDosages: ['0.5mg', '1mg', '2mg'] },
  { name: 'Clonazepam', category: 'Benzodiazepine', commonDosages: ['0.5mg', '1mg', '2mg'] },
  { name: 'Zolpidem', category: 'Sleep Aid', commonDosages: ['5mg', '10mg'] },
  { name: 'Insulin Glargine', category: 'Insulin', commonDosages: ['100 units/mL'] },
  { name: 'Insulin Lispro', category: 'Insulin', commonDosages: ['100 units/mL'] },
  { name: 'Sitagliptin', category: 'DPP-4 Inhibitor', commonDosages: ['25mg', '50mg', '100mg'] },
  { name: 'Empagliflozin', category: 'SGLT2 Inhibitor', commonDosages: ['10mg', '25mg'] },
  { name: 'Rosuvastatin', category: 'Statin', commonDosages: ['5mg', '10mg', '20mg', '40mg'] },
  { name: 'Pravastatin', category: 'Statin', commonDosages: ['10mg', '20mg', '40mg', '80mg'] },
  { name: 'Carvedilol', category: 'Beta Blocker', commonDosages: ['3.125mg', '6.25mg', '12.5mg', '25mg'] },
  { name: 'Atenolol', category: 'Beta Blocker', commonDosages: ['25mg', '50mg', '100mg'] },
  { name: 'Propranolol', category: 'Beta Blocker', commonDosages: ['10mg', '20mg', '40mg', '60mg', '80mg'] },
  { name: 'Diltiazem', category: 'Calcium Channel Blocker', commonDosages: ['30mg', '60mg', '90mg', '120mg', '180mg', '240mg'] },
  { name: 'Verapamil', category: 'Calcium Channel Blocker', commonDosages: ['40mg', '80mg', '120mg', '180mg', '240mg'] },
  { name: 'Nifedipine', category: 'Calcium Channel Blocker', commonDosages: ['10mg', '20mg', '30mg', '60mg', '90mg'] },
  { name: 'Spironolactone', category: 'Diuretic', commonDosages: ['25mg', '50mg', '100mg'] },
  { name: 'Amoxicillin', category: 'Antibiotic', commonDosages: ['250mg', '500mg', '875mg'] },
  { name: 'Azithromycin', category: 'Antibiotic', commonDosages: ['250mg', '500mg'] },
  { name: 'Ciprofloxacin', category: 'Antibiotic', commonDosages: ['250mg', '500mg', '750mg'] },
  { name: 'Doxycycline', category: 'Antibiotic', commonDosages: ['50mg', '100mg'] },
  { name: 'Cetirizine', category: 'Antihistamine', commonDosages: ['5mg', '10mg'] },
  { name: 'Loratadine', category: 'Antihistamine', commonDosages: ['10mg'] },
  { name: 'Fexofenadine', category: 'Antihistamine', commonDosages: ['60mg', '180mg'] },
  { name: 'Diphenhydramine', category: 'Antihistamine', commonDosages: ['25mg', '50mg'] },
  
  // Over-the-Counter
  { name: 'Acetaminophen', category: 'Pain/Fever', commonDosages: ['325mg', '500mg', '650mg', '1000mg'] },
  { name: 'Ibuprofen', category: 'NSAID', commonDosages: ['200mg', '400mg', '600mg', '800mg'] },
  { name: 'Naproxen', category: 'NSAID', commonDosages: ['220mg', '250mg', '375mg', '500mg'] },
  { name: 'Aspirin', category: 'NSAID/Antiplatelet', commonDosages: ['81mg', '325mg', '500mg'] },
  { name: 'Famotidine', category: 'H2 Blocker', commonDosages: ['10mg', '20mg', '40mg'] },
  { name: 'Ranitidine', category: 'H2 Blocker', commonDosages: ['75mg', '150mg', '300mg'] },
  { name: 'Calcium Carbonate', category: 'Antacid', commonDosages: ['500mg', '750mg', '1000mg'] },
  { name: 'Loperamide', category: 'Antidiarrheal', commonDosages: ['2mg'] },
  { name: 'Bismuth Subsalicylate', category: 'GI', commonDosages: ['262mg', '524mg'] },
  { name: 'Docusate Sodium', category: 'Stool Softener', commonDosages: ['100mg', '250mg'] },
  { name: 'Senna', category: 'Laxative', commonDosages: ['8.6mg', '17.2mg'] },
  { name: 'Polyethylene Glycol', category: 'Laxative', commonDosages: ['17g'] },
  { name: 'Pseudoephedrine', category: 'Decongestant', commonDosages: ['30mg', '60mg', '120mg'] },
  { name: 'Phenylephrine', category: 'Decongestant', commonDosages: ['10mg'] },
  { name: 'Dextromethorphan', category: 'Cough Suppressant', commonDosages: ['10mg', '15mg', '30mg'] },
  { name: 'Guaifenesin', category: 'Expectorant', commonDosages: ['200mg', '400mg', '600mg'] },
  
  // Vitamins & Supplements
  { name: 'Vitamin D3', category: 'Vitamin', commonDosages: ['400IU', '1000IU', '2000IU', '5000IU', '10000IU'] },
  { name: 'Vitamin B12', category: 'Vitamin', commonDosages: ['500mcg', '1000mcg', '2500mcg', '5000mcg'] },
  { name: 'Vitamin C', category: 'Vitamin', commonDosages: ['250mg', '500mg', '1000mg'] },
  { name: 'Vitamin B Complex', category: 'Vitamin', commonDosages: ['1 tablet'] },
  { name: 'Multivitamin', category: 'Vitamin', commonDosages: ['1 tablet'] },
  { name: 'Folic Acid', category: 'Vitamin', commonDosages: ['400mcg', '800mcg', '1mg'] },
  { name: 'Iron (Ferrous Sulfate)', category: 'Mineral', commonDosages: ['65mg', '325mg'] },
  { name: 'Calcium + Vitamin D', category: 'Mineral', commonDosages: ['600mg/400IU', '600mg/800IU'] },
  { name: 'Magnesium', category: 'Mineral', commonDosages: ['200mg', '250mg', '400mg', '500mg'] },
  { name: 'Zinc', category: 'Mineral', commonDosages: ['15mg', '30mg', '50mg'] },
  { name: 'Potassium', category: 'Mineral', commonDosages: ['99mg', '595mg'] },
  { name: 'Omega-3 Fish Oil', category: 'Supplement', commonDosages: ['1000mg', '1200mg', '2000mg'] },
  { name: 'Glucosamine', category: 'Supplement', commonDosages: ['500mg', '750mg', '1500mg'] },
  { name: 'Chondroitin', category: 'Supplement', commonDosages: ['400mg', '600mg'] },
  { name: 'CoQ10', category: 'Supplement', commonDosages: ['50mg', '100mg', '200mg'] },
  { name: 'Probiotics', category: 'Supplement', commonDosages: ['1 billion CFU', '5 billion CFU', '10 billion CFU', '50 billion CFU'] },
  { name: 'Melatonin', category: 'Supplement', commonDosages: ['1mg', '3mg', '5mg', '10mg'] },
  { name: 'Biotin', category: 'Vitamin', commonDosages: ['1000mcg', '5000mcg', '10000mcg'] },
  { name: 'Turmeric/Curcumin', category: 'Supplement', commonDosages: ['500mg', '1000mg'] },
  { name: 'Ashwagandha', category: 'Herbal', commonDosages: ['300mg', '600mg'] },
  { name: 'Elderberry', category: 'Herbal', commonDosages: ['125mg', '175mg'] },
  { name: 'Echinacea', category: 'Herbal', commonDosages: ['400mg', '500mg'] },
  { name: 'Ginger', category: 'Herbal', commonDosages: ['250mg', '500mg', '550mg'] },
  { name: 'Valerian Root', category: 'Herbal', commonDosages: ['450mg', '500mg'] },
  { name: 'St. John\'s Wort', category: 'Herbal', commonDosages: ['300mg'] },
  { name: 'Milk Thistle', category: 'Herbal', commonDosages: ['175mg', '250mg'] },
  { name: 'Ginkgo Biloba', category: 'Herbal', commonDosages: ['60mg', '120mg'] },
  { name: 'Green Tea Extract', category: 'Supplement', commonDosages: ['400mg', '500mg'] },
  { name: 'Apple Cider Vinegar', category: 'Supplement', commonDosages: ['500mg', '750mg'] },
  { name: 'Collagen', category: 'Supplement', commonDosages: ['2.5g', '5g', '10g'] },
  { name: 'Saw Palmetto', category: 'Herbal', commonDosages: ['160mg', '320mg'] },
  { name: 'Cranberry Extract', category: 'Supplement', commonDosages: ['400mg', '500mg'] },
  { name: 'Garlic Extract', category: 'Herbal', commonDosages: ['500mg', '1000mg'] },
];

export interface MedicationSuggestion {
  name: string;
  category: string;
  commonDosages: string[];
}

export function useMedicationDatabase() {
  const [searchTerm, setSearchTerm] = useState('');

  const suggestions = useMemo((): MedicationSuggestion[] => {
    if (!searchTerm || searchTerm.length < 2) return [];
    
    const lowerSearch = searchTerm.toLowerCase();
    
    return MEDICATION_DATABASE
      .filter(med => 
        med.name.toLowerCase().includes(lowerSearch) ||
        med.category.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 10); // Limit to 10 suggestions
  }, [searchTerm]);

  const getMedicationByName = useCallback((name: string): MedicationSuggestion | undefined => {
    return MEDICATION_DATABASE.find(
      med => med.name.toLowerCase() === name.toLowerCase()
    );
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    suggestions,
    getMedicationByName,
    allMedications: MEDICATION_DATABASE,
  };
}
