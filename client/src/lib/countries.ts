export interface CountryInfo {
  code: string;
  name: string;
  idLabel: string;
  idPlaceholder: string;
  idPattern?: RegExp;
  idHint: string;
  minAge: number;
}

export const COUNTRIES: CountryInfo[] = [
  { code: 'NG', name: 'Nigeria', idLabel: 'NIN (National Identification Number)', idPlaceholder: 'e.g. 12345678901', idPattern: /^\d{11}$/, idHint: '11 digits', minAge: 18 },
  { code: 'US', name: 'United States', idLabel: 'SSN (Social Security Number)', idPlaceholder: 'e.g. 123-45-6789', idPattern: /^\d{3}-?\d{2}-?\d{4}$/, idHint: '9 digits', minAge: 18 },
  { code: 'GB', name: 'United Kingdom', idLabel: 'National Insurance Number', idPlaceholder: 'e.g. QQ123456C', idPattern: /^[A-Z]{2}\d{6}[A-Z]$/i, idHint: '2 letters, 6 digits, 1 letter', minAge: 18 },
  { code: 'CA', name: 'Canada', idLabel: 'SIN (Social Insurance Number)', idPlaceholder: 'e.g. 123-456-789', idPattern: /^\d{3}-?\d{3}-?\d{3}$/, idHint: '9 digits', minAge: 18 },
  { code: 'GH', name: 'Ghana', idLabel: 'Ghana Card Number', idPlaceholder: 'e.g. GHA-123456789-1', idHint: 'Ghana Card ID', minAge: 18 },
  { code: 'ZA', name: 'South Africa', idLabel: 'ID Number', idPlaceholder: 'e.g. 1234567890123', idPattern: /^\d{13}$/, idHint: '13 digits', minAge: 18 },
  { code: 'KE', name: 'Kenya', idLabel: 'National ID Number', idPlaceholder: 'e.g. 12345678', idPattern: /^\d{7,9}$/, idHint: '7-9 digits', minAge: 18 },
  { code: 'IN', name: 'India', idLabel: 'Aadhaar Number', idPlaceholder: 'e.g. 1234 5678 9012', idPattern: /^\d{4} ?\d{4} ?\d{4}$/, idHint: '12 digits', minAge: 18 },
  { code: 'AU', name: 'Australia', idLabel: 'Tax File Number (TFN)', idPlaceholder: 'e.g. 123 456 789', idHint: '8-9 digits', minAge: 18 },
  { code: 'DE', name: 'Germany', idLabel: 'Personalausweis ID', idPlaceholder: 'e.g. T01000T47', idHint: 'German ID card number', minAge: 18 },
  { code: 'FR', name: 'France', idLabel: 'Carte Nationale d\'Identité', idPlaceholder: 'CNI Number', idHint: '12 characters', minAge: 18 },
  { code: 'BR', name: 'Brazil', idLabel: 'CPF', idPlaceholder: 'e.g. 123.456.789-09', idPattern: /^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/, idHint: '11 digits', minAge: 18 },
  { code: 'MX', name: 'Mexico', idLabel: 'CURP', idPlaceholder: 'e.g. ABCD123456EFGHIJ01', idHint: '18 characters', minAge: 18 },
  { code: 'PH', name: 'Philippines', idLabel: 'PhilSys ID (PSN)', idPlaceholder: 'e.g. 1234-5678-9012', idHint: '12 digits', minAge: 18 },
  { code: 'AE', name: 'United Arab Emirates', idLabel: 'Emirates ID', idPlaceholder: 'e.g. 784-1234-1234567-1', idPattern: /^784-?\d{4}-?\d{7}-?\d$/, idHint: '15 digits', minAge: 18 },
  { code: 'OTHER', name: 'Other', idLabel: 'Government-issued ID Number', idPlaceholder: 'Enter your ID number', idHint: 'Any government-issued ID', minAge: 18 },
];

export function findCountry(code?: string | null): CountryInfo | undefined {
  if (!code) return undefined;
  return COUNTRIES.find(c => c.code === code);
}
