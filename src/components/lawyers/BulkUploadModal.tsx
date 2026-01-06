import React, { useState, useCallback, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Upload, Download, Check, X, AlertCircle, Loader2, FileText } from 'lucide-react';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table as DocxTable, TableRow, TableCell, WidthType } from 'docx';
import { saveAs } from 'file-saver';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Table from '../ui/Table';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { toast } from 'react-hot-toast';
import { Timestamp } from 'firebase/firestore';

interface LawyerBulkData {
  rowIndex: number;
  Fname: string;
  Lname: string;
  Email: string;
  'Mobile Number': string;
  Title: string;
  Designation: string;
  'Practice ID': string;
  'Practice Name': string; // For display/mapping
  Region: string;
  'User Pic': string;
  'Active Days': number | string;
  'Off Days': number | string;
  'Shift': number | string;
  'Shift Start': string;
  'Shift Switch': number | string;
  isSelected: boolean;
  errors: string[];
  isValid: boolean;
}

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (lawyers: Omit<LawyerBulkData, 'rowIndex' | 'isSelected' | 'errors' | 'isValid' | 'Practice Name'>[]) => Promise<{ success: number; failed: number; errors: string[] }>;
  departments: Array<{ id: string; 'Practice ID'?: string; 'Practice Name'?: string; 'Department ID'?: string; 'Department Name'?: string }>;
  Title: string[];
  Region: string[];
}

const BulkUploadModal: React.FC<BulkUploadModalProps> = ({
  isOpen,
  onClose,
  onImport,
  departments,
  Title,
  Region,
  existingUsers = [],
}) => {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [lawyerData, setLawyerData] = useState<LawyerBulkData[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);

  // Generate Excel template
  const generateTemplate = useCallback(() => {
    const today = new Date();
    const defaultShiftStart = today.toISOString().split('T')[0];

    const templateData = [
      {
        'First Name*': 'John',
        'Last Name*': 'Doe',
        'Email*': 'john.doe@example.com',
        'Mobile Number*': '+1234567890',
        'Title*': 'Dr.',
        'Designation*': 'Senior Lawyer',
        'Practice Name*': departments[0]?.['Practice Name'] || departments[0]?.['Department Name'] || '',
        'Region*': 'Greater Accra',
        'Profile Picture URL': '',
        'Active Days': '5',
        'Off Days': '2',
        'Number of Shifts': '1',
        'Shift Start Date': defaultShiftStart,
        'Shift Switch Frequency': '0',
      },
    ];

    // Add a few more example rows
    for (let i = 0; i < 2; i++) {
      templateData.push({
        'First Name*': `Jane${i + 1}`,
        'Last Name*': `Smith${i + 1}`,
        'Email*': `jane${i + 1}.smith@example.com`,
        'Mobile Number*': `+123456789${i + 1}`,
        'Title*': 'Mr.',
        'Designation*': 'Lawyer',
        'Practice Name*': departments[0]?.['Practice Name'] || departments[0]?.['Department Name'] || '',
        'Region*': 'Ashanti',
        'Profile Picture URL': '',
        'Active Days': '5',
        'Off Days': '2',
        'Number of Shifts': '1',
        'Shift Start Date': defaultShiftStart,
        'Shift Switch Frequency': '0',
      });
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lawyers');

    // Add instructions sheet
    const instructions = [
      { Column: 'First Name*', Description: 'Required. First name of the lawyer', Valid_Values: 'Any text' },
      { Column: 'Last Name*', Description: 'Required. Last name of the lawyer', Valid_Values: 'Any text' },
      { Column: 'Email*', Description: 'Required. Unique email address', Valid_Values: 'Valid email format' },
      { Column: 'Mobile Number*', Description: 'Required. Contact number', Valid_Values: 'Any format' },
      { Column: 'Title*', Description: 'Required. Title prefix', Valid_Values: Title.filter(t => t !== 'Select a title').join(', ') },
      { Column: 'Designation*', Description: 'Required. Job title/designation', Valid_Values: 'Any text' },
      { Column: 'Practice Name*', Description: 'Required. Practice name (must match existing practice)', Valid_Values: departments.map(d => d['Practice Name'] || d['Department Name'] || '').filter(Boolean).join(', ') },
      { Column: 'Region*', Description: 'Required. Geographic region', Valid_Values: Region.filter(r => r !== 'Select a region').join(', ') },
      { Column: 'Profile Picture URL', Description: 'Optional. URL to profile picture', Valid_Values: 'Valid URL' },
      { Column: 'Active Days', Description: 'Required. Number of consecutive working days', Valid_Values: 'Positive number (e.g., 5)' },
      { Column: 'Off Days', Description: 'Required. Number of consecutive off days', Valid_Values: 'Positive number (e.g., 2)' },
      { Column: 'Number of Shifts', Description: 'Required. Number of shifts per day (1=Whole Day, 2=Morning/Evening, 3=Morning/Afternoon/Evening)', Valid_Values: '1, 2, or 3' },
      { Column: 'Shift Start Date', Description: 'Required. Date when the shift schedule starts', Valid_Values: 'Date in YYYY-MM-DD format' },
      { Column: 'Shift Switch Frequency', Description: 'Required. How many days before switching shifts', Valid_Values: 'Positive number (0 = no switching)' },
    ];
    const instructionsWs = XLSX.utils.json_to_sheet(instructions);
    XLSX.utils.book_append_sheet(wb, instructionsWs, 'Instructions');

    XLSX.writeFile(wb, 'lawyer_bulk_upload_template.xlsx');
    toast.success('Template downloaded successfully!');
  }, [departments, Title, Region]);

  // Generate Word document with field explanations
  const generateFieldLegend = useCallback(async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: "Lawyer Bulk Upload Template - Field Legend",
              heading: HeadingLevel.HEADING_1,
            }),
            new Paragraph({
              text: "This document explains all the fields in the bulk upload template and how to fill them correctly.",
              spacing: { after: 400 },
            }),
            new Paragraph({
              text: "Required Fields (marked with *)",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new DocxTable({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Field Name")] }),
                    new TableCell({ children: [new Paragraph("Description")] }),
                    new TableCell({ children: [new Paragraph("Valid Values / Format")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("First Name*")] }),
                    new TableCell({ children: [new Paragraph("The lawyer's first name (given name)")] }),
                    new TableCell({ children: [new Paragraph("Any text (e.g., John, Mary, Kwame)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Last Name*")] }),
                    new TableCell({ children: [new Paragraph("The lawyer's last name (surname)")] }),
                    new TableCell({ children: [new Paragraph("Any text (e.g., Doe, Smith, Mensah)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Email*")] }),
                    new TableCell({ children: [new Paragraph("Unique email address for the lawyer. Used for login credentials.")] }),
                    new TableCell({ children: [new Paragraph("Valid email format (e.g., john.doe@example.com). Must be unique across all users.")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Mobile Number*")] }),
                    new TableCell({ children: [new Paragraph("Contact phone number")] }),
                    new TableCell({ children: [new Paragraph("Any format (e.g., +1234567890, 0244123456)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Title*")] }),
                    new TableCell({ children: [new Paragraph("Title prefix (honorific)")] }),
                    new TableCell({ children: [new Paragraph(Title.filter(t => t !== 'Select a title').join(', '))] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Designation*")] }),
                    new TableCell({ children: [new Paragraph("Job title or professional designation")] }),
                    new TableCell({ children: [new Paragraph("Any text (e.g., Senior Lawyer, Junior Associate, Partner)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Practice Name*")] }),
                    new TableCell({ children: [new Paragraph("The practice area the lawyer belongs to. Must exactly match an existing practice name.")] }),
                    new TableCell({ children: [new Paragraph(departments.map(d => d['Practice Name'] || d['Department Name'] || '').filter(Boolean).join(', ') || 'Available practices from your system')] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Region*")] }),
                    new TableCell({ children: [new Paragraph("Geographic region where the lawyer operates")] }),
                    new TableCell({ children: [new Paragraph(Region.filter(r => r !== 'Select a region').join(', '))] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Active Days")] }),
                    new TableCell({ children: [new Paragraph("Number of consecutive working days before off days")] }),
                    new TableCell({ children: [new Paragraph("Positive number (e.g., 5 means 5 working days)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Off Days")] }),
                    new TableCell({ children: [new Paragraph("Number of consecutive off/rest days after active days")] }),
                    new TableCell({ children: [new Paragraph("Positive number (e.g., 2 means 2 days off)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Number of Shifts")] }),
                    new TableCell({ children: [new Paragraph("Number of shifts per day")] }),
                    new TableCell({ children: [new Paragraph("1 = Whole Day, 2 = Morning/Evening, 3 = Morning/Afternoon/Evening")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Shift Start Date")] }),
                    new TableCell({ children: [new Paragraph("Date when the shift schedule pattern begins")] }),
                    new TableCell({ children: [new Paragraph("Date in YYYY-MM-DD format (e.g., 2024-01-15)")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Shift Switch Frequency")] }),
                    new TableCell({ children: [new Paragraph("How many days before switching to a different shift (for multi-shift schedules)")] }),
                    new TableCell({ children: [new Paragraph("Non-negative number (0 = no switching, e.g., 7 = switch every 7 days)")] }),
                  ],
                }),
              ],
            }),
            new Paragraph({
              text: "Optional Fields",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new DocxTable({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Field Name")] }),
                    new TableCell({ children: [new Paragraph("Description")] }),
                    new TableCell({ children: [new Paragraph("Valid Values / Format")] }),
                  ],
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Profile Picture URL")] }),
                    new TableCell({ children: [new Paragraph("URL to the lawyer's profile picture image")] }),
                    new TableCell({ children: [new Paragraph("Valid URL to an image file (e.g., https://example.com/photo.jpg). Leave empty if not available.")] }),
                  ],
                }),
              ],
            }),
            new Paragraph({
              text: "Important Notes",
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 400, after: 200 },
            }),
            new Paragraph({
              text: "• All required fields (marked with *) must be filled in for each lawyer.",
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: "• Email addresses must be unique - duplicate emails will cause import errors.",
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: "• Practice names must exactly match existing practices in the system.",
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: "• Schedule fields (Active Days, Off Days, etc.) define the work pattern for the lawyer.",
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: "• After uploading, you can review and edit all data before final import.",
              spacing: { after: 100 },
            }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, 'lawyer_bulk_upload_field_legend.docx');
    toast.success('Field legend document downloaded successfully!');
  }, [departments, Title, Region]);

  // Validate email format
  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Validate a single lawyer record
  const validateLawyer = useCallback((lawyer: LawyerBulkData, allEmails: Set<string>, existingEmails: Set<string>): string[] => {
    const errors: string[] = [];

    if (!lawyer.Fname?.trim()) errors.push('First Name is required');
    if (!lawyer.Lname?.trim()) errors.push('Last Name is required');
    if (!lawyer.Email?.trim()) {
      errors.push('Email is required');
    } else {
      const emailLower = lawyer.Email.toLowerCase();
      if (!validateEmail(lawyer.Email)) {
        errors.push('Email format is invalid');
      } else if (allEmails.has(emailLower)) {
        errors.push('Email is duplicate within file');
      } else if (existingEmails.has(emailLower)) {
        errors.push('Email already exists in system');
      }
    }
    if (!lawyer['Mobile Number']?.trim()) errors.push('Mobile Number is required');
    if (!lawyer.Title || lawyer.Title === 'Select a title') errors.push('Title is required');
    if (!lawyer.Designation?.trim()) errors.push('Designation is required');
    if (!lawyer['Practice ID']) errors.push('Practice is required');
    if (!lawyer.Region || lawyer.Region === 'Select a region') errors.push('Region is required');
    
    // Validate schedule fields
    const activeDays = typeof lawyer['Active Days'] === 'string' ? parseInt(lawyer['Active Days']) : lawyer['Active Days'];
    if (!lawyer['Active Days'] || lawyer['Active Days'] === '' || isNaN(Number(activeDays)) || Number(activeDays) < 0) {
      errors.push('Active Days must be a non-negative number');
    }
    
    const offDays = typeof lawyer['Off Days'] === 'string' ? parseInt(lawyer['Off Days']) : lawyer['Off Days'];
    if (!lawyer['Off Days'] || lawyer['Off Days'] === '' || isNaN(Number(offDays)) || Number(offDays) < 0) {
      errors.push('Off Days must be a non-negative number');
    }
    
    const shift = typeof lawyer['Shift'] === 'string' ? parseInt(lawyer['Shift']) : lawyer['Shift'];
    if (!lawyer['Shift'] || lawyer['Shift'] === '' || isNaN(Number(shift)) || Number(shift) < 1 || Number(shift) > 3) {
      errors.push('Number of Shifts must be 1, 2, or 3');
    }
    
    if (!lawyer['Shift Start'] || lawyer['Shift Start'] === '') {
      errors.push('Shift Start Date is required');
    }
    
    const shiftSwitch = typeof lawyer['Shift Switch'] === 'string' ? parseInt(lawyer['Shift Switch']) : lawyer['Shift Switch'];
    if (lawyer['Shift Switch'] === '' || lawyer['Shift Switch'] === undefined || isNaN(Number(shiftSwitch)) || Number(shiftSwitch) < 0) {
      errors.push('Shift Switch Frequency must be a non-negative number');
    }

    return errors;
  }, []);

  // Parse Excel file
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFile = event.target.files?.[0];
    if (!uploadedFile) return;

    if (!uploadedFile.name.endsWith('.xlsx') && !uploadedFile.name.endsWith('.xls')) {
      toast.error('Please upload a valid Excel file (.xlsx or .xls)');
      return;
    }

    setFile(uploadedFile);
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

        if (jsonData.length === 0) {
          toast.error('The Excel file is empty');
          setIsProcessing(false);
          return;
        }

        // Map Excel columns to our data structure
        const mappedData: LawyerBulkData[] = jsonData.map((row, index) => {
          const practiceName = row['Practice Name*'] || row['Practice Name'] || row['Department Name*'] || row['Department Name'] || '';
          const practice = departments.find(
            d => (d['Practice Name'] || d['Department Name'])?.toLowerCase() === practiceName?.toString().toLowerCase()
          );

          return {
            rowIndex: index + 2, // +2 because Excel row 1 is header, and we're 0-indexed
            Fname: (row['First Name*'] || row['First Name'] || '').toString().trim(),
            Lname: (row['Last Name*'] || row['Last Name'] || '').toString().trim(),
            Email: (row['Email*'] || row['Email'] || '').toString().trim(),
            'Mobile Number': (row['Mobile Number*'] || row['Mobile Number'] || '').toString().trim(),
            Title: (row['Title*'] || row['Title'] || '').toString().trim(),
            Designation: (row['Designation*'] || row['Designation'] || '').toString().trim(),
            'Practice ID': practice?.id || practice?.['Practice ID'] || practice?.['Department ID'] || '',
            'Practice Name': practiceName.toString().trim(),
            Region: (row['Region*'] || row['Region'] || '').toString().trim(),
            'User Pic': (row['Profile Picture URL'] || row['User Pic'] || '').toString().trim(),
            'Active Days': row['Active Days'] || '5',
            'Off Days': row['Off Days'] || '2',
            'Shift': row['Number of Shifts'] || row['Shift'] || '1',
            'Shift Start': row['Shift Start Date'] || row['Shift Start'] || new Date().toISOString().split('T')[0],
            'Shift Switch': row['Shift Switch Frequency'] || row['Shift Switch'] || '0',
            isSelected: true,
            errors: [],
            isValid: false,
          };
        });

        // Validate all records and check for duplicate emails
        // First pass: collect all emails to check for duplicates within file
        const emailMap = new Map<string, number[]>();
        mappedData.forEach((lawyer, index) => {
          if (lawyer.Email) {
            const emailLower = lawyer.Email.toLowerCase();
            if (!emailMap.has(emailLower)) {
              emailMap.set(emailLower, []);
            }
            emailMap.get(emailLower)!.push(index);
          }
        });

        // Get existing emails from system
        const existingEmails = new Set<string>();
        existingUsers.forEach(user => {
          if (user.Email) {
            existingEmails.add(user.Email.toLowerCase());
          }
        });

        // Second pass: validate each record
        mappedData.forEach((lawyer, index) => {
          // Create email set excluding current email (for checking duplicates within file)
          const otherEmails = new Set<string>();
          mappedData.forEach((l, i) => {
            if (i !== index && l.Email) {
              otherEmails.add(l.Email.toLowerCase());
            }
          });
          
          lawyer.errors = validateLawyer(lawyer, otherEmails, existingEmails);
          lawyer.isValid = lawyer.errors.length === 0;
        });

        setLawyerData(mappedData);
        setStep('preview');
        toast.success(`Loaded ${mappedData.length} lawyer(s) from file`);
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast.error('Failed to parse Excel file. Please check the format.');
      } finally {
        setIsProcessing(false);
      }
    };

    reader.readAsArrayBuffer(uploadedFile);
  }, [departments, validateLawyer]);

  // Update a lawyer field
  const updateLawyerField = useCallback((index: number, field: keyof LawyerBulkData, value: any) => {
    setLawyerData((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Re-validate this record
      const otherEmails = new Set<string>();
      updated.forEach((l, i) => {
        if (i !== index && l.Email) {
          otherEmails.add(l.Email.toLowerCase());
        }
      });
      
      // Get existing emails from system
      const existingEmails = new Set<string>();
      existingUsers.forEach(user => {
        if (user.Email) {
          existingEmails.add(user.Email.toLowerCase());
        }
      });
      
      updated[index].errors = validateLawyer(updated[index], otherEmails, existingEmails);
      updated[index].isValid = updated[index].errors.length === 0;
      
      return updated;
    });
  }, [validateLawyer, existingUsers]);

  // Toggle selection
  const toggleSelection = useCallback((index: number) => {
    setLawyerData((prev) => {
      const updated = [...prev];
      updated[index].isSelected = !updated[index].isSelected;
      return updated;
    });
  }, []);

  // Delete a row
  const deleteRow = useCallback((index: number) => {
    setLawyerData((prev) => prev.filter((_, i) => i !== index));
    toast.success('Row removed');
  }, []);

  // Get selected lawyers
  const selectedLawyers = useMemo(() => {
    return lawyerData.filter(l => l.isSelected && l.isValid);
  }, [lawyerData]);

  // Handle bulk import
  const handleBulkImport = useCallback(async () => {
    if (selectedLawyers.length === 0) {
      toast.error('Please select at least one valid lawyer to import');
      return;
    }

    setStep('importing');
    setIsProcessing(true);

    try {
      const lawyersToImport = selectedLawyers.map(lawyer => ({
        Fname: lawyer.Fname,
        Lname: lawyer.Lname,
        Email: lawyer.Email,
        'Mobile Number': lawyer['Mobile Number'],
        Title: lawyer.Title,
        Designation: lawyer.Designation,
        'Practice ID': lawyer['Practice ID'],
        Region: lawyer.Region,
        'User Pic': lawyer['User Pic'],
        'Active Days': typeof lawyer['Active Days'] === 'string' ? parseInt(lawyer['Active Days']) || 5 : lawyer['Active Days'] || 5,
        'Off Days': typeof lawyer['Off Days'] === 'string' ? parseInt(lawyer['Off Days']) || 2 : lawyer['Off Days'] || 2,
        'Shift': typeof lawyer['Shift'] === 'string' ? parseInt(lawyer['Shift']) || 1 : lawyer['Shift'] || 1,
        'Shift Start': lawyer['Shift Start'],
        'Shift Switch': typeof lawyer['Shift Switch'] === 'string' ? parseInt(lawyer['Shift Switch']) || 0 : lawyer['Shift Switch'] || 0,
      }));

      const results = await onImport(lawyersToImport);
      setImportResults(results);
      
      if (results.success > 0) {
        toast.success(`Successfully imported ${results.success} lawyer(s)`);
      }
      if (results.failed > 0) {
        toast.error(`Failed to import ${results.failed} lawyer(s)`);
      }

      // Wait a bit before closing to show results
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error) {
      console.error('Bulk import error:', error);
      toast.error('Failed to import lawyers');
      setStep('preview');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedLawyers, onImport]);

  // Reset and close
  const handleClose = useCallback(() => {
    setStep('upload');
    setFile(null);
    setLawyerData([]);
    setImportResults(null);
    onClose();
  }, [onClose]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        step === 'upload' ? 'Bulk Upload Lawyers' :
        step === 'preview' ? 'Review & Edit Lawyer Data' :
        'Importing Lawyers...'
      }
      size="xl"
    >
      {step === 'upload' && (
        <div className="space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Instructions:</h3>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              <li>Download the Excel template below</li>
              <li>Fill in the lawyer data (required fields are marked with *)</li>
              <li>Upload the completed file</li>
              <li>Review and edit the data in the preview</li>
              <li>Select the lawyers you want to import</li>
              <li>Confirm the import</li>
            </ol>
          </div>

          <div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
            />
            <label
              htmlFor="file-upload"
              className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg p-8 space-y-4 cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
            >
              <Upload className="w-12 h-12 text-gray-700" />
              <div className="text-center">
                <p className="text-gray-900 font-medium mb-1">Upload Excel File</p>
                <p className="text-sm text-gray-600">Click here or choose a file</p>
                <p className="text-xs text-gray-500 mt-1">Select .xlsx or .xls file</p>
              </div>
              <span className="inline-flex items-center justify-center font-medium rounded-xl px-6 py-3 h-11 bg-gray-800 hover:bg-gray-900 text-white transition-all duration-200 shadow-lg hover:shadow-xl">
                Choose File
              </span>
            </label>
            {file && (
              <p className="text-sm text-gray-700 mt-4 text-center font-medium">
                Selected: <span className="text-gray-900">{file.name}</span>
              </p>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <Button
              onClick={generateTemplate}
              variant="outline"
              className="flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download Excel Template
            </Button>
            <Button
              onClick={generateFieldLegend}
              variant="outline"
              className="flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Download Field Legend (Word)
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
            <div>
              <p className="text-sm text-gray-700">
                Total: <span className="font-semibold">{lawyerData.length}</span> |{' '}
                Valid: <span className="font-semibold text-green-600">{lawyerData.filter(l => l.isValid).length}</span> |{' '}
                Invalid: <span className="font-semibold text-red-600">{lawyerData.filter(l => !l.isValid).length}</span> |{' '}
                Selected: <span className="font-semibold text-gray-600">{selectedLawyers.length}</span>
              </p>
            </div>
            <Button
              onClick={() => setLawyerData(prev => prev.map(l => ({ ...l, isSelected: l.isValid })))}
              variant="outline"
              size="sm"
            >
              Select All Valid
            </Button>
          </div>

          <div className="max-h-[600px] overflow-y-auto border border-gray-200 rounded-lg">
            <div className="overflow-x-auto">
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.Head className="w-12">Sel</Table.Head>
                    <Table.Head className="w-12">Row</Table.Head>
                    <Table.Head className="min-w-[140px]">First Name</Table.Head>
                    <Table.Head className="min-w-[140px]">Last Name</Table.Head>
                    <Table.Head className="min-w-[200px]">Email</Table.Head>
                    <Table.Head className="min-w-[130px]">Mobile</Table.Head>
                    <Table.Head className="min-w-[100px]">Title</Table.Head>
                    <Table.Head className="min-w-[150px]">Designation</Table.Head>
                    <Table.Head className="min-w-[200px]">Practice</Table.Head>
                    <Table.Head className="min-w-[140px]">Region</Table.Head>
                    <Table.Head className="min-w-[100px]">Active Days</Table.Head>
                    <Table.Head className="min-w-[100px]">Off Days</Table.Head>
                    <Table.Head className="min-w-[100px]">Shifts</Table.Head>
                    <Table.Head className="min-w-[140px]">Shift Start</Table.Head>
                    <Table.Head className="min-w-[120px]">Shift Switch</Table.Head>
                    <Table.Head className="w-16">Actions</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {lawyerData.map((lawyer, index) => (
                    <Table.Row
                      key={index}
                      className={lawyer.isValid ? '' : 'bg-red-50'}
                    >
                      <Table.Cell>
                        <input
                          type="checkbox"
                          checked={lawyer.isSelected}
                          onChange={() => toggleSelection(index)}
                          disabled={!lawyer.isValid}
                          className="cursor-pointer"
                        />
                      </Table.Cell>
                      <Table.Cell className="font-medium">{lawyer.rowIndex}</Table.Cell>
                      <Table.Cell>
                        <Input
                          value={lawyer.Fname}
                          onChange={(e) => updateLawyerField(index, 'Fname', e.target.value)}
                          className="w-full min-w-[120px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          value={lawyer.Lname}
                          onChange={(e) => updateLawyerField(index, 'Lname', e.target.value)}
                          className="w-full min-w-[120px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          value={lawyer.Email}
                          onChange={(e) => updateLawyerField(index, 'Email', e.target.value)}
                          className="w-full min-w-[180px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          value={lawyer['Mobile Number']}
                          onChange={(e) => updateLawyerField(index, 'Mobile Number', e.target.value)}
                          className="w-full min-w-[110px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Select
                          value={lawyer.Title}
                          onChange={(value) => updateLawyerField(index, 'Title', value)}
                          options={Title.map(t => ({ value: t, label: t }))}
                          className="w-full min-w-[90px] text-sm"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          value={lawyer.Designation}
                          onChange={(e) => updateLawyerField(index, 'Designation', e.target.value)}
                          className="w-full min-w-[130px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell style={{ overflow: 'visible' }}>
                        <div style={{ minWidth: '200px', width: '100%' }}>
                          <select
                            value={lawyer['Practice ID'] || ''}
                            onChange={(e) => {
                              const value = e.target.value;
                              const practice = departments.find(d => 
                                d.id === value || 
                                d['Practice ID'] === value || 
                                d['Department ID'] === value
                              );
                              updateLawyerField(index, 'Practice ID', value);
                              updateLawyerField(index, 'Practice Name', practice?.['Practice Name'] || practice?.['Department Name'] || '');
                            }}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            style={{ minWidth: '200px' }}
                          >
                            <option value="">Select Practice</option>
                            {departments.map(d => {
                              const practiceId = d.id || d['Practice ID'] || d['Department ID'];
                              const practiceName = d['Practice Name'] || d['Department Name'] || 'Unnamed Practice';
                              return (
                                <option key={practiceId} value={practiceId} title={practiceName}>
                                  {practiceName}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <Select
                          value={lawyer.Region}
                          onChange={(value) => updateLawyerField(index, 'Region', value)}
                          options={Region.map(r => ({ value: r, label: r }))}
                          className="w-full min-w-[120px] text-sm"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          value={lawyer['Active Days']}
                          onChange={(e) => updateLawyerField(index, 'Active Days', e.target.value)}
                          className="w-full min-w-[80px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          value={lawyer['Off Days']}
                          onChange={(e) => updateLawyerField(index, 'Off Days', e.target.value)}
                          className="w-full min-w-[80px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          value={lawyer['Shift']}
                          onChange={(e) => updateLawyerField(index, 'Shift', e.target.value)}
                          className="w-full min-w-[80px] text-sm py-2 px-3"
                          min="1"
                          max="3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="date"
                          value={lawyer['Shift Start']}
                          onChange={(e) => updateLawyerField(index, 'Shift Start', e.target.value)}
                          className="w-full min-w-[120px] text-sm py-2 px-3"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Input
                          type="number"
                          value={lawyer['Shift Switch']}
                          onChange={(e) => updateLawyerField(index, 'Shift Switch', e.target.value)}
                          className="w-full min-w-[100px] text-sm py-2 px-3"
                          min="0"
                        />
                      </Table.Cell>
                      <Table.Cell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteRow(index)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            </div>
          </div>

          {lawyerData.some(l => l.errors.length > 0) && (
            <div className="space-y-2">
              <h4 className="font-semibold text-red-600">Validation Errors:</h4>
              {lawyerData.map((lawyer, index) => (
                lawyer.errors.length > 0 && (
                  <div key={index} className="bg-red-50 border border-red-200 rounded p-2 text-sm">
                    <p className="font-medium text-red-800">Row {lawyer.rowIndex}:</p>
                    <ul className="list-disc list-inside text-red-600">
                      {lawyer.errors.map((error, errIndex) => (
                        <li key={errIndex}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setStep('upload')}
            >
              Back
            </Button>
            <Button
              onClick={handleBulkImport}
              disabled={selectedLawyers.length === 0 || isProcessing}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                `Import ${selectedLawyers.length} Lawyer(s)`
              )}
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="space-y-4 text-center py-8">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-gray-600" />
          <p className="text-gray-900 font-medium">Importing lawyers...</p>
          {importResults && (
            <div className="mt-4 space-y-2">
              {importResults.success > 0 && (
                <p className="text-green-600">
                  <Check className="w-5 h-5 inline mr-1" />
                  Successfully imported: {importResults.success}
                </p>
              )}
              {importResults.failed > 0 && (
                <p className="text-red-600">
                  <AlertCircle className="w-5 h-5 inline mr-1" />
                  Failed: {importResults.failed}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default BulkUploadModal;

