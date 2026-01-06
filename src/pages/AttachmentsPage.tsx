import React, { useEffect, useMemo, useState } from 'react';
import { FileText, ImageIcon, Eye } from 'lucide-react';
import { getDownloadURL, listAll, ref, getMetadata } from 'firebase/storage';
import { collection, onSnapshot } from 'firebase/firestore';
import { useHospital } from '../contexts/HospitalContext';
import Layout from '../components/layout/Layout';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import Spinner from '../components/ui/Spinner';
import { db, storage } from '../firebase';
import { Referral } from '../types';

// Skeleton Loading Components
const RecordCardSkeleton = () => (
  <div className="bg-gray-100 rounded-lg shadow-md border border-gray-200 p-6 animate-pulse">
    <div className="space-y-4">
      <div className="flex justify-center">
        <div className="h-24 w-24 bg-gray-200 rounded-md"></div>
      </div>
      <div className="space-y-2">
        <div className="h-6 w-3/4 bg-gray-200 rounded"></div>
        <div className="h-4 w-full bg-gray-200 rounded"></div>
        <div className="h-4 w-5/6 bg-gray-200 rounded"></div>
        <div className="h-4 w-2/3 bg-gray-200 rounded"></div>
      </div>
      <div className="h-10 w-full bg-gray-300 rounded"></div>
    </div>
  </div>
);

const HeaderSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
    <div className="h-4 w-80 bg-gray-200 rounded"></div>
  </div>
);

const SearchSkeleton = () => (
  <div className="max-w-md h-10 bg-gray-200 rounded animate-pulse"></div>
);

interface Attachment {
  id: string;
  fileUrl: string;
  fileType: 'pdf' | 'image';
  name: string;
  serialNumber: string;
  referral?: Referral;
}

const Attachments: React.FC = () => {
  const { hospital } = useHospital();
  const [records, setRecords] = useState<Attachment[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<Attachment | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;
  // Fetch referrals from Firestore
  useEffect(() => {
    if (!hospital?.id) {
      setLoading(false);
      setIsPageLoading(false);
      return;
    }

    const referralRef = collection(db, 'Chamber', hospital.id, 'Referrals');
    const unsub = onSnapshot(referralRef, (snapshot) => {
      const fetchedReferrals = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
        'Serial Number': doc.id,
      })) as Referral[];
      setReferrals(fetchedReferrals);
    }, (error) => {
      console.error('Error fetching referrals:', error);
    });

    return () => unsub();
  }, [hospital?.id]);

  // Fetch users from Firestore for lawyer names
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

  // Fetch files from Firebase Storage and link to referrals
  useEffect(() => {
    const fetchData = async () => {
      if (!hospital?.id) {
        setLoading(false);
        setIsPageLoading(false);
        return;
      }

      try {
        setLoading(true);
        setIsPageLoading(true);

        const folderRef = ref(storage, 'referral_files');
        const list = await listAll(folderRef);

        const files = await Promise.all(
          list.items.map(async (itemRef) => {
            const url = await getDownloadURL(itemRef);
            const metadata = await getMetadata(itemRef);
            const contentType = metadata.contentType;
            let fileType: 'pdf' | 'image' = 'image';

            if (contentType === 'application/pdf') {
              fileType = 'pdf';
            } else if (contentType?.startsWith('image/')) {
              fileType = 'image';
            }

            const serialNumber = itemRef.name.split('.')[0];
            const referral = referrals.find(
              (r) => r['Serial Number'] === serialNumber || r.id === serialNumber
            );

            return {
              id: itemRef.name,
              fileUrl: url,
              fileType,
              name: itemRef.name,
              serialNumber,
              referral,
            };
          })
        );

        setRecords(files);
      } catch (error) {
        console.error('Error fetching attachments:', error);
      } finally {
        setLoading(false);
        setIsPageLoading(false);
      }
    };

    fetchData();
  }, [hospital?.id, referrals]);

  const filteredRecords = records.filter((record) => {
    if (!searchTerm.trim()) return true;
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const referral = record.referral;
    const lawyer = referral
      ? users.find((u) => u.id === referral['Referred By'])
      : null;
    const lawyerName = lawyer?.Fname?.toLowerCase() || '';

    return (
      record.serialNumber.toLowerCase().includes(normalizedSearch) ||
      record.name.toLowerCase().includes(normalizedSearch) ||
      (referral && (
        referral['Name']?.toLowerCase().includes(normalizedSearch) ||
        referral['Sex']?.toLowerCase().includes(normalizedSearch) ||
        referral['Reason for Referral']?.toLowerCase().includes(normalizedSearch) ||
        referral['Age']?.toLowerCase().includes(normalizedSearch) ||
        referral['Date of Birth']?.toLowerCase().includes(normalizedSearch) ||
        referral['Uploaded Attachments']?.toLowerCase().includes(normalizedSearch) ||
        lawyerName.includes(normalizedSearch)
      ))
    );
  });

    const paginatedRecords = useMemo(() => {
      return filteredRecords.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      );
    }, [filteredRecords, currentPage, itemsPerPage]);
  
    const getPageNumbers = () => {
      const maxPagesToShow = 3;
      const pages: number[] = [];
      const startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
      const endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);
  
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
      return pages;
    };
  
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);

  return (
    <Layout>
      <div className="space-y-6 bg-gray-50 p-6 rounded-lg">
        {/* Header */}
        {isPageLoading ? (
          <HeaderSkeleton />
        ) : (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-teal-900">Attachments</h1>
              <p className="mt-2 text-base text-teal-700">
                View and manage uploaded attachment files
              </p>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="sticky top-0 z-10 bg-gray-50 py-4">
          {isPageLoading ? (
            <SearchSkeleton />
          ) : (
            <Input
              placeholder="Search by serial number, client name, lawyer, etc..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md bg-gray-100 border-gray-200 text-teal-900 placeholder-teal-600"
            />
          )}
        </div>

        {/* Records Grid */}
        {isPageLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <RecordCardSkeleton key={index} />
            ))}
          </div>
        ) : loading ? (
          <div className="flex flex-col justify-center items-center py-10">
            <Spinner/>
            <span className="text-teal-700 mt-2">Loading attachments...</span>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-teal-700 text-lg">No records found.</p>
            <p className="text-teal-600 mt-2">Try adjusting your search term or check if files and referrals are uploaded.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedRecords.map((record) => (
              <div
                key={record.id}
                className="bg-gray-100 rounded-lg shadow-md border border-gray-200 p-6 hover:bg-gray-200 transition-all duration-200 cursor-pointer"
                onClick={() => setSelectedRecord(record)}
              >
                <div className="space-y-4">
                  <div className="flex justify-center">
                    {record.fileType === 'pdf' ? (
                      <div className="h-24 w-24 flex items-center justify-center bg-gray-50 rounded-md">
                        <FileText className="w-12 h-12 text-teal-600" />
                      </div>
                    ) : (
                      <img
                        src={record.fileUrl}
                        alt="Record preview"
                        className="h-24 w-24 object-cover rounded-md shadow-sm"
                      />
                    )}
                  </div>

                  <div>
                    <h3 className="text-lg font-semibold text-teal-900 truncate">
                      Serial: {record.serialNumber}
                    </h3>
                    {record.referral && (
                      <div className="mt-2 space-y-1 text-sm text-teal-700">
                        <p>Client: {record.referral['Name'] || 'N/A'}</p>
                        <p>Sex: {record.referral['Sex'] || 'N/A'}</p>
                        <p>Reason: {record.referral['Reason for Referral'] || 'N/A'}</p>
                      </div>
                    )}
                    <p className="text-sm text-teal-600 mt-2">
                      Type: {record.fileType.toUpperCase()}
                    </p>
                  </div>

                  <Button
                    className="w-full bg-gray-600 hover:bg-gray-700 text-white flex items-center justify-center"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRecord(record);
                    }}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    View Attachment
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

                        {filteredRecords.length > itemsPerPage && (
                  <div className="flex justify-between items-center mt-4 px-4 pb-4 no-print">
                    <p className="text-sm text-white">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg bg-gray-500 text-gray-900 hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </Button>
                      {getPageNumbers().map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-5 py-1.5 rounded-xl ${currentPage === page ? 'bg-gradient-to-r from-teal-500 to-teal-600 text-white shadow-lg' : 'bg-gray-400 text-gray-100 hover:bg-gray-600'}`}
                        >
                          {page}
                        </button>
                      ))}
                      <Button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-lg bg-gray-500 text-gray-900 hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

        {/* View Record Modal */}
        <Modal
          isOpen={!!selectedRecord}
          onClose={() => setSelectedRecord(null)}
          title={selectedRecord?.serialNumber || selectedRecord?.name || 'View Attachment'}
          size="xl"
        >
          <div className="p-4">
            {selectedRecord?.fileType === 'pdf' ? (
              <iframe
                src={selectedRecord.fileUrl}
                title="PDF Record"
                className="w-full h-[80vh] border border-gray-200 rounded-md"
              />
            ) : (
              <img
                src={selectedRecord?.fileUrl}
                alt="Attachment"
                className="max-w-full max-h-[80vh] mx-auto rounded-md shadow-md"
              />
            )}
            {selectedRecord?.referral && (
              <div className="mt-4 space-y-2 text-teal-700">
                <p><strong>Serial Number:</strong> {selectedRecord.referral['Serial Number']}</p>
                <p><strong>Client:</strong> {selectedRecord.referral['Name']}</p>
                <p><strong>Age:</strong> {selectedRecord.referral['Age']}</p>
                <p><strong>Date of Birth:</strong> {selectedRecord.referral['Date of Birth']}</p>
                <p><strong>Sex:</strong> {selectedRecord.referral['Sex']}</p>
                <p><strong>Reason:</strong> {selectedRecord.referral['Reason for Referral']}</p>
                <p><strong>Referred By:</strong> {users.find((u) => u.id === selectedRecord.referral?.['Referred By'])?.Fname || 'Unknown'}</p>
                <p><strong>Uploaded Attachments:</strong> {selectedRecord.referral['Uploaded Attachments'] || 'N/A'}</p>
              </div>
            )}
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default Attachments;