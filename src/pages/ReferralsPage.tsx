import React, { useEffect, useState } from 'react';
import { useHospital } from '../contexts/HospitalContext';
import Layout from '../components/layout/Layout';
import Table from '../components/ui/Table';
import Input from '../components/ui/Input';
import Spinner from '../components/ui/Spinner';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { collection, getDocs, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Referral } from '../types';

// Skeleton Loading Components
const ReferralsHeaderSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-8 w-32 bg-gray-200 rounded-lg mb-2"></div>
    <div className="h-4 w-64 bg-gray-200 rounded-md"></div>
  </div>
);

const SearchBarSkeleton = () => (
  <div className="h-10 w-full max-w-md bg-gray-200 rounded-lg animate-pulse"></div>
);

const TableRowSkeleton = () => (
  <tr className="animate-pulse">
    {[...Array(7)].map((_, i) => (
      <td key={i} className="px-6 py-4">
        <div className="h-4 bg-gray-200 rounded"></div>
      </td>
    ))}
  </tr>
);

const PaginationSkeleton = () => (
  <div className="flex justify-between items-center mt-4 px-4 pb-4 animate-pulse">
    <div className="h-4 w-24 bg-gray-200 rounded"></div>
    <div className="flex space-x-1">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="h-8 w-8 bg-gray-200 rounded"></div>
      ))}
    </div>
  </div>
);

const ReferralsPage: React.FC = () => {
  const { referrals, hospital } = useHospital();
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

  // Fetch referrals with real-time updates
  useEffect(() => {
    if (!hospital?.id) {
      console.warn('No hospital ID available. Cannot fetch referrals.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const referralCollectionRef = collection(db, 'Chamber', hospital.id, 'Referrals');
    const unsub = onSnapshot(referralCollectionRef, (snapshot) => {
      const fetchedReferrals: Referral[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }) as Referral);
      setHospitalReferrals({ [hospital.id]: fetchedReferrals });
      setLoading(false);
    }, (error) => {
      console.error('Error fetching referrals:', error);
      setLoading(false);
    });

    return () => unsub();
  }, [hospital?.id]);

  // Fetch users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'Users'), (snapshot) => {
      const fetchedUsers = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setUsers(fetchedUsers);
    }, (error) => {
      console.error('Error fetching users:', error);
    });
    return () => unsub();
  }, []);

  // Fetch department and hospital names
  useEffect(() => {
    async function fetchMetadata() {
      // Fetch departments
      const deptSnapshot = await getDocs(collection(db, 'Department'));
      const deptMap: Record<string, string> = {};
      deptSnapshot.forEach((doc) => {
        deptMap[doc.id] = doc.data()['Department Name'] || 'Unknown';
      });
      setDepartments(deptMap);

      // Fetch chambers
      const chamberSnapshot = await getDocs(collection(db, 'Chamber'));
      const hospMap: Record<string, string> = {};
      chamberSnapshot.forEach((doc) => {
        hospMap[doc.id] = doc.data()['Chamber Name'] || 'Unknown';
      });
      setHospitals(hospMap);
    }

    fetchMetadata();
  }, []);

  // Fetch lawyer details for modal
  const fetchLawyerDetails = async (userId: string) => {
    setLawyerLoading(true);
    try {
      const userDoc = await getDoc(doc(db, 'Users', userId));
      if (userDoc.exists()) {
        setSelectedLawyer({ id: userDoc.id, ...userDoc.data() });
      } else {
        setSelectedLawyer(null);
        console.warn(`No user found with ID: ${userId}`);
      }
    } catch (error) {
      console.error('Error fetching lawyer details:', error);
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

  // Generate page numbers for pagination
  const getPageNumbers = () => {
    const maxPagesToShow = 5;
    const pages: number[] = [];
    const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <Layout>
      <div className="space-y-6 bg-gray-50 p-6 rounded-lg">
        {/* Header */}
        <div className="flex justify-between items-center">
          {loading ? (
            <ReferralsHeaderSkeleton />
          ) : (
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Referrals</h1>
              <p className="mt-2 text-base text-gray-700">Manage incoming client case referrals</p>
            </div>
          )}
        </div>

        {/* Search Bar */}
        <div className="sticky top-0 z-10 bg-gray-50 py-4">
          {loading ? (
            <SearchBarSkeleton />
          ) : (
            <Input
              placeholder="Search by client, lawyer, or serial number..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="max-w-md bg-gray-100 border-teal-200 text-gray-900 placeholder-teal-600 focus:ring-teal-500 focus:border-teal-500"
            />
          )}
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="bg-gray-100 shadow-lg rounded-lg overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row className="bg-gray-200">
                  {[...Array(7)].map((_, i) => (
                    <Table.Head key={i} className="text-gray-900 font-semibold">
                      <div className="h-4 w-24 bg-gray-300 rounded"></div>
                    </Table.Head>
                  ))}
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {[...Array(5)].map((_, i) => (
                  <TableRowSkeleton key={i} />
                ))}
              </Table.Body>
            </Table>
            <PaginationSkeleton />
          </div>
        ) : filteredReferrals.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-teal-600 text-lg">No referrals found.</p>
          </div>
        ) : (
          <div className="bg-gray-100 shadow-lg rounded-lg overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row className="bg-gray-200">
                  <Table.Head className="text-gray-900 font-semibold">Serial Number</Table.Head>
                  <Table.Head className="text-gray-900 font-semibold">Client Name</Table.Head>
                  <Table.Head className="text-gray-900 font-semibold">Sex</Table.Head>
                  <Table.Head className="text-gray-900 font-semibold">Reason</Table.Head>
                  <Table.Head className="text-gray-900 font-semibold">Referring Lawyer</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {paginatedReferrals.map((referral, index) => (
                  <Table.Row
                    key={referral.id}
                    className={`hover:bg-gray-200 transition-colors ${index % 2 === 0 ? 'bg-gray-50' : 'bg-gray-100'}`}
                  >
                    <Table.Cell className="font-medium text-gray-900">{referral['Serial Number']}</Table.Cell>
                    <Table.Cell className="text-gray-900">{referral['Name']}</Table.Cell>
                    <Table.Cell className="text-gray-700">{referral['Sex']}</Table.Cell>
                    <Table.Cell className="text-gray-700">{referral['Reason for Referral']}</Table.Cell>
                    <Table.Cell>
                      <button
                        onClick={() => {
                          fetchLawyerDetails(String(referral['Referred By']));
                          setLawyerModalOpen(true);
                        }}
                        className="text-teal-600 hover:text-teal-800 font-medium underline"
                      >
                        {users.find((u) => u.id === referral['Referred By'])?.Fname || 'Unknown'}
                      </button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>

            {/* Pagination Controls */}
            {filteredReferrals.length > itemsPerPage && (
              <div className="flex justify-between items-center mt-4 px-4 pb-4">
                <p className="text-sm text-teal-600">
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex space-x-1">
                  <Button
                    onClick={() => setCurrentPage((prev) => prev - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </Button>
                  {getPageNumbers().map((page) => (
                       <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-5 py-1.5 rounded-xl ${currentPage === page ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg' : 'bg-gray-400 text-gray-100 hover:bg-gray-600'}`}
                        >
                          {page}
                        </button>
                  ))}
                  <Button
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Lawyer Details Modal */}
        <Modal
          isOpen={lawyerModalOpen}
          onClose={() => {
            setLawyerModalOpen(false);
            setSelectedLawyer(null);
          }}
          title="Referring Lawyer Details"
          size="md"
        >
          {lawyerLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : !selectedLawyer ? (
            <p className="text-teal-600 text-center py-6">No lawyer information available.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                {selectedLawyer['User Pic'] ? (
                  <img
                    src={selectedLawyer['User Pic']}
                    alt={`${selectedLawyer.Fname} ${selectedLawyer.Lname}`}
                    className="h-16 w-16 rounded-full object-cover shadow-md"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-full bg-gradient-to-r from-teal-600 to-teal-700 flex items-center justify-center text-white text-xl font-semibold shadow-md">
                    {selectedLawyer.Fname?.charAt(0) || '?'}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedLawyer.Fname} {selectedLawyer.Lname}
                  </h3>
                  <p className="text-sm text-teal-600">
                    Practice: {departments[selectedLawyer['Department ID']] || 'Unknown'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-gray-700">
                  <span className="font-medium">Chamber:</span>{' '}
                  {hospitals[selectedLawyer['Chamber ID']] || 'Unknown'}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Email:</span> {selectedLawyer.Email || 'N/A'}
                </p>
                <p className="text-gray-700">
                  <span className="font-medium">Mobile Number:</span>{' '}
                  {selectedLawyer['Mobile Number'] || 'N/A'}
                </p>
              </div>
              <Button
                onClick={() => {
                  setLawyerModalOpen(false);
                  setSelectedLawyer(null);
                }}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white"
              >
                Close
              </Button>
            </div>
          )}
        </Modal>
      </div>
    </Layout>
  );
};

export default ReferralsPage;