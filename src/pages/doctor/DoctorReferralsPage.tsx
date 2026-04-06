import React, { useEffect, useState } from 'react';
import DoctorLayout from '../../components/layout/DoctorLayout';
import { useHospital } from '../../contexts/HospitalContext';
import Table from '../../components/ui/Table';
import Input from '../../components/ui/Input';
import Spinner from '../../components/ui/Spinner';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { collection, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Referral } from '../../types';

const DoctorReferralsPage: React.FC = () => {
  const { hospital } = useHospital();
  const [hospitalReferrals, setHospitalReferrals] = useState<Record<string, Referral[]>>({});
  const [users, setUsers] = useState<any[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [hospitals, setHospitals] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [lawyerModalOpen, setLawyerModalOpen] = useState(false);
  const [selectedLawyer, setSelectedLawyer] = useState<any | null>(null);
  const [lawyerLoading, setLawyerLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!hospital?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const referralCollectionRef = collection(db, 'Chamber', hospital.id, 'Referrals');
    const unsub = onSnapshot(
      referralCollectionRef,
      (snapshot) => {
        const fetchedReferrals: Referral[] = snapshot.docs.map(
          (d) => ({ id: d.id, ...d.data() }) as Referral
        );
        setHospitalReferrals({ [hospital.id]: fetchedReferrals });
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [hospital?.id]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Users'), (snapshot) => {
      setUsers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    async function fetchMetadata() {
      const deptSnapshot = await getDocs(collection(db, 'Department'));
      const deptMap: Record<string, string> = {};
      deptSnapshot.forEach((d) => {
        deptMap[d.id] = d.data()['Department Name'] || 'Unknown';
      });
      setDepartments(deptMap);

      const chamberSnapshot = await getDocs(collection(db, 'Chamber'));
      const hospMap: Record<string, string> = {};
      chamberSnapshot.forEach((d) => {
        hospMap[d.id] = d.data()['Chamber Name'] || 'Unknown';
      });
      setHospitals(hospMap);
    }
    fetchMetadata();
  }, []);

  const fetchLawyerDetails = async (userId: string) => {
    setLawyerLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'Users', userId));
      if (userDoc.exists()) {
        setSelectedLawyer({ id: userDoc.id, ...userDoc.data() });
      } else {
        setSelectedLawyer(null);
      }
    } catch {
      setSelectedLawyer(null);
    } finally {
      setLawyerLoading(false);
    }
  };

  const filteredReferrals = (hospitalReferrals[hospital?.id || ''] || []).filter((referral) => {
    const lawyer = users.find((u) => u.id === referral['Referred By']);
    const lawyerName = `${lawyer?.Fname || ''} ${lawyer?.Lname || ''}`.toLowerCase();
    return (
      referral['Name']?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lawyerName.includes(searchTerm.toLowerCase()) ||
      referral['Serial Number']?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalPages = Math.ceil(filteredReferrals.length / itemsPerPage);
  const paginatedReferrals = filteredReferrals.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <DoctorLayout>
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
          <p className="text-slate-600">Referrals sent to your chamber.</p>
        </div>

        <Input
          placeholder="Search by client, lawyer, or serial number..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setCurrentPage(1);
          }}
          className="max-w-md bg-white"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        ) : !hospital?.id ? (
          <p className="text-slate-600">We could not load your chamber. Ask your administrator to link your account.</p>
        ) : filteredReferrals.length === 0 ? (
          <p className="text-slate-600">No referrals yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>Serial</Table.Head>
                  <Table.Head>Client</Table.Head>
                  <Table.Head>Sex</Table.Head>
                  <Table.Head>Reason</Table.Head>
                  <Table.Head>Referring lawyer</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {paginatedReferrals.map((referral, index) => (
                  <Table.Row key={referral.id} className={index % 2 === 0 ? 'bg-slate-50/80' : ''}>
                    <Table.Cell className="font-medium">{referral['Serial Number']}</Table.Cell>
                    <Table.Cell>{referral['Name']}</Table.Cell>
                    <Table.Cell>{referral['Sex']}</Table.Cell>
                    <Table.Cell>{referral['Reason for Referral']}</Table.Cell>
                    <Table.Cell>
                      <button
                        type="button"
                        onClick={() => {
                          fetchLawyerDetails(String(referral['Referred By']));
                          setLawyerModalOpen(true);
                        }}
                        className="text-teal-700 underline hover:text-teal-900"
                      >
                        {users.find((u) => u.id === referral['Referred By'])?.Fname || 'View'}
                      </button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
            {filteredReferrals.length > itemsPerPage && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <p className="text-sm text-slate-600">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    onClick={() => setCurrentPage((p) => p - 1)}
                    disabled={currentPage === 1}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <Modal
          isOpen={lawyerModalOpen}
          onClose={() => {
            setLawyerModalOpen(false);
            setSelectedLawyer(null);
          }}
          title="Referring lawyer"
          size="md"
        >
          {lawyerLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !selectedLawyer ? (
            <p className="py-6 text-center text-slate-600">No details found.</p>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                <span className="font-medium">Name:</span> {selectedLawyer.Fname} {selectedLawyer.Lname}
              </p>
              <p>
                <span className="font-medium">Email:</span> {selectedLawyer.Email || '—'}
              </p>
              <p>
                <span className="font-medium">Chamber:</span>{' '}
                {hospitals[selectedLawyer['Chamber ID']] || '—'}
              </p>
              <p>
                <span className="font-medium">Practice:</span>{' '}
                {departments[selectedLawyer['Department ID']] || '—'}
              </p>
            </div>
          )}
        </Modal>
      </div>
    </DoctorLayout>
  );
};

export default DoctorReferralsPage;
