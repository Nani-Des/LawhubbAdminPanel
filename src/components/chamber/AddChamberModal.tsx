import React, { useMemo, useState } from 'react';
import Modal from '../ui/Modal';
import Input from '../ui/Input';
import Select from '../ui/Select';
import Button from '../ui/Button';
import { COUNTRY_OPTIONS, DEFAULT_COUNTRY_CODE } from '../../constants/countries';
import {
  chamberIdExists,
  createChamber,
  ensurePracticeOnChamber,
  suggestChamberIdFromName,
} from '../../utils/chamberProvisioning';
import { toTitleCase } from '../../utils/stringSimilarity';
import toast from 'react-hot-toast';

export interface AddChamberFormValues {
  chamberId: string;
  chamberName: string;
  location: string;
  city: string;
  countryCode: string;
  contact: string;
  email: string;
  practiceNames: string[];
}

const emptyForm = (): AddChamberFormValues => ({
  chamberId: '',
  chamberName: '',
  location: '',
  city: '',
  countryCode: DEFAULT_COUNTRY_CODE,
  contact: '',
  email: '',
  practiceNames: [''],
});

interface AddChamberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated?: (chamberId: string) => void;
  initialValues?: Partial<AddChamberFormValues>;
}

const AddChamberModal: React.FC<AddChamberModalProps> = ({
  isOpen,
  onClose,
  onCreated,
  initialValues,
}) => {
  const [form, setForm] = useState<AddChamberFormValues>(() => ({
    ...emptyForm(),
    ...initialValues,
    practiceNames: initialValues?.practiceNames?.length
      ? initialValues.practiceNames
      : [''],
  }));
  const [isLoading, setIsLoading] = useState(false);
  const [idTouched, setIdTouched] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setForm({
      ...emptyForm(),
      ...initialValues,
      practiceNames: initialValues?.practiceNames?.length
        ? initialValues.practiceNames
        : [''],
    });
    setIdTouched(Boolean(initialValues?.chamberId));
  }, [isOpen, initialValues]);

  const suggestedId = useMemo(
    () => suggestChamberIdFromName(form.chamberName),
    [form.chamberName]
  );

  const handleNameChange = (name: string) => {
    setForm((prev) => ({
      ...prev,
      chamberName: name,
      chamberId: idTouched ? prev.chamberId : suggestChamberIdFromName(name),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const chamberId = form.chamberId.trim();
    const chamberName = form.chamberName.trim();

    if (!chamberId || !chamberName || !form.location.trim() || !form.city.trim()) {
      toast.error('Chamber ID, name, location, and city are required.');
      return;
    }
    if (!form.contact.trim()) {
      toast.error('Contact number is required.');
      return;
    }
    if (!form.countryCode) {
      toast.error('Country is required.');
      return;
    }

    setIsLoading(true);
    try {
      if (await chamberIdExists(chamberId)) {
        toast.error(`Chamber ID "${chamberId}" is already in use.`);
        return;
      }

      await createChamber({
        chamberId,
        chamberName: toTitleCase(chamberName),
        location: form.location.trim(),
        city: form.city.trim(),
        countryCode: form.countryCode,
        contact: form.contact.trim(),
        email: form.email.trim(),
      });

      const practiceNames = form.practiceNames.map((p) => p.trim()).filter(Boolean);
      for (const name of practiceNames) {
        await ensurePracticeOnChamber(chamberId, name);
      }

      toast.success(`Chamber "${toTitleCase(chamberName)}" created.`);
      onCreated?.(chamberId);
      onClose();
    } catch (err) {
      console.error('Failed to create chamber:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to create chamber.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add new chamber" size="lg">
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Chamber name"
            value={form.chamberName}
            onChange={(e) => handleNameChange(e.target.value)}
            required
            placeholder="e.g. Smith & Associates"
          />
          <Input
            label="Chamber ID"
            value={form.chamberId}
            onChange={(e) => {
              setIdTouched(true);
              setForm((prev) => ({ ...prev, chamberId: e.target.value }));
            }}
            required
            helperText={`Document ID in Firestore. Suggested: ${suggestedId || '—'}`}
            placeholder="e.g. smith_associates"
          />
          <Input
            label="Location / address"
            value={form.location}
            onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))}
            required
            className="sm:col-span-2"
          />
          <Input
            label="City"
            value={form.city}
            onChange={(e) => setForm((prev) => ({ ...prev, city: e.target.value }))}
            required
          />
          <Select
            label="Country"
            value={form.countryCode}
            onChange={(value) => setForm((prev) => ({ ...prev, countryCode: value }))}
            options={COUNTRY_OPTIONS.map((c) => ({
              value: c.code,
              label: `${c.name} (${c.code})`,
            }))}
          />
          <Input
            label="Contact phone"
            value={form.contact}
            onChange={(e) => setForm((prev) => ({ ...prev, contact: e.target.value }))}
            required
          />
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            placeholder="Optional"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-800">
            Initial Practice Areas <span className="font-normal text-slate-500">(optional)</span>
          </p>
          <div className="space-y-2">
            {form.practiceNames.map((name, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={name}
                  onChange={(e) => {
                    const next = [...form.practiceNames];
                    next[idx] = e.target.value;
                    setForm((prev) => ({ ...prev, practiceNames: next }));
                  }}
                  placeholder="Practice Area Name"
                />
                {form.practiceNames.length > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        practiceNames: prev.practiceNames.filter((_, i) => i !== idx),
                      }))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setForm((prev) => ({ ...prev, practiceNames: [...prev.practiceNames, ''] }))
              }
            >
              Add Practice Area
            </Button>
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" isLoading={isLoading}>
            Create chamber
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default AddChamberModal;
