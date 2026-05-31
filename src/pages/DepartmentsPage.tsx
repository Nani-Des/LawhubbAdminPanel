import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { FolderPlus, Edit, Trash, Search } from 'lucide-react';
import { useHospital } from '../contexts/HospitalContext';
import Layout from '../components/layout/Layout';
import Table from '../components/ui/Table';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { toast } from 'react-hot-toast';
import { collection, getDocs, setDoc, doc, query } from 'firebase/firestore';
import { db } from '../firebase';

// Skeleton Loading Components
const TableRowSkeleton = () => (
  <Table.Row>
    <Table.Cell>
      <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
    </Table.Cell>
    <Table.Cell>
      <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse"></div>
    </Table.Cell>
    <Table.Cell>
      <div className="flex space-x-2">
        <div className="h-8 w-16 bg-gray-200 rounded animate-pulse"></div>
        <div className="h-8 w-16 bg-red-200 rounded animate-pulse"></div>
      </div>
    </Table.Cell>
  </Table.Row>
);

const DepartmentFormSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="flex space-x-4 mb-4">
      <div className="h-10 bg-gray-200 rounded w-1/2"></div>
      <div className="h-10 bg-gray-200 rounded w-1/2"></div>
    </div>
    <div className="h-16 bg-gray-100 rounded"></div>
    <div className="flex justify-end space-x-2">
      <div className="h-10 w-20 bg-gray-200 rounded"></div>
      <div className="h-10 w-32 bg-gray-600 rounded"></div>
    </div>
  </div>
);

const HeaderSkeleton = () => (
  <div className="flex justify-between items-center animate-pulse">
    <div>
      <div className="h-8 bg-gray-200 rounded w-48 mb-2"></div>
      <div className="h-4 bg-gray-200 rounded w-64"></div>
    </div>
    <div className="h-10 bg-gray-600 rounded w-40"></div>
  </div>
);

const SearchSkeleton = () => (
  <div className="relative max-w-md animate-pulse">
    <div className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 bg-gray-200 rounded"></div>
    <div className="h-10 bg-gray-100 rounded pl-10"></div>
  </div>
);

interface Department {
  id: string;
  'Practice ID'?: string;
  'Practice Name'?: string;
  'Department ID'?: string; // Backward compatibility
  'Department Name'?: string; // Backward compatibility
}

const DepartmentForm = React.memo(
  ({
    formData,
    setFormData,
    handleSubmit,
    isLoading,
    selectedDepartment,
    onCancel,
    mode,
    setMode,
    availableDepartments,
  }: {
    formData: {
      'Practice ID'?: string;
      'Practice Name'?: string;
      'Department ID'?: string; // Backward compatibility
      'Department Name'?: string; // Backward compatibility
      selectedDepartmentId?: string;
    };
    setFormData: React.Dispatch<React.SetStateAction<any>>;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    isLoading: boolean;
    selectedDepartment?: string | null;
    onCancel: () => void;
    mode: 'select' | 'create';
    setMode: React.Dispatch<React.SetStateAction<'select' | 'create'>>;
    availableDepartments: Department[];
  }) => {
    console.log('DepartmentForm rendered');

    const handleInputChange = useCallback(
      (key: string, value: string) => {
        setFormData((prev: any) => ({ ...prev, [key]: value }));
      },
      [setFormData]
    );

    return (
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex space-x-4 mb-4">
          <Button
            type="button"
            variant={mode === 'select' ? 'primary' : 'outline'}
            onClick={() => setMode('select')}
            className={
              mode === 'select'
                ? 'bg-gray-600 text-white hover:bg-gray-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-100'
            }
          >
            Select Existing
          </Button>
          <Button
            type="button"
            variant={mode === 'create' ? 'primary' : 'outline'}
            onClick={() => setMode('create')}
            className={
              mode === 'create'
                ? 'bg-gray-600 text-white hover:bg-gray-700'
                : 'border-gray-200 text-gray-700 hover:bg-gray-100'
            }
          >
            Create New
          </Button>
        </div>

        {mode === 'select' && (
          <Select
            label="Select Practice"
            value={formData.selectedDepartmentId || ''}
            onChange={(value) => handleInputChange('selectedDepartmentId', value)}
            options={[
              { value: '', label: 'Choose a practice' },
              ...availableDepartments.map((dept) => ({
                value: dept['Practice ID'] || dept['Department ID'] || dept.id,
                label: dept['Practice Name'] || dept['Department Name'] || '',
              })),
            ]}
            required
            className="bg-gray-50 border-gray-200 text-teal-900"
          />
        )}

        {mode === 'create' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Practice Name"
              value={formData['Practice Name'] || formData['Department Name'] || ''}
              onChange={(e) => {
                handleInputChange('Practice Name', e.target.value);
                handleInputChange('Department Name', e.target.value); // Backward compatibility
              }}
              required
              className="bg-gray-50 border-gray-200 text-teal-900 placeholder-teal-600"
              placeholder="e.g., Family Law"
            />
            <Input
              label="Practice ID"
              value={formData['Practice ID'] || formData['Department ID'] || ''}
              onChange={(e) => {
                handleInputChange('Practice ID', e.target.value);
                handleInputChange('Department ID', e.target.value); // Backward compatibility
              }}
              className="bg-gray-50 border-gray-200 text-teal-900 placeholder-teal-600"
              placeholder="e.g., FAMILY123 (leave blank for auto-generated)"
            />
          </div>
        )}

        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            className="border-gray-200 text-gray-700 hover:bg-gray-100"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isLoading || (mode === 'select' && !formData.selectedDepartmentId)}
            className="bg-gray-600 hover:bg-gray-700 text-white"
          >
            {isLoading
              ? 'Saving...'
              : selectedDepartment
              ? 'Update Practice'
              : mode === 'select'
              ? 'Add to chamber'
              : 'Create and Add Practice'}
          </Button>
        </div>
      </form>
    );
  }
);

const DepartmentsPage: React.FC = () => {
  const { departments, addDepartment, updateDepartment, deleteDepartment, hospital } = useHospital();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [formData, setFormData] = useState<any>({
    'Practice ID': '',
    'Practice Name': '',
    'Department ID': '', // Backward compatibility
    'Department Name': '', // Backward compatibility
    selectedDepartmentId: '',
  });
  const [mode, setMode] = useState<'select' | 'create'>('select');
  const [availableDepartments, setAvailableDepartments] = useState<Department[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 9;

  // Fetch departments from Department collection
  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        setIsPageLoading(true);
        const deptQuery = query(collection(db, 'Practice'));
        const snapshot = await getDocs(deptQuery);
        const depts = snapshot.docs.map((doc) => ({
          id: doc.id,
          'Practice ID': doc.id,
          'Practice Name': doc.data()['Practice Name'] || '',
        }));
        // Exclude practices already assigned to chamber
        const unassignedDepts = depts.filter(
          (dept) => !departments.some((d: any) => {
            const deptId = d['Practice ID'] || d['Department ID'] || d.id;
            const practiceId = dept['Practice ID'] || dept.id;
            return deptId === practiceId;
          })
        );
        setAvailableDepartments(unassignedDepts);
      } catch (err) {
        console.error('Failed to fetch departments:', err);
        toast.error('Failed to load available practices');
      } finally {
        setIsPageLoading(false);
      }
    };
    fetchDepartments();
  }, [departments]);

  // Memoized filtered and sorted departments
  const filteredDepartments = useMemo(() => {
    return departments
      .filter((dept: any) => {
        const name = dept['Practice Name'] || dept['Department Name'] || '';
        return name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a: any, b: any) => {
        const nameA = a['Practice Name'] || a['Department Name'] || '';
        const nameB = b['Practice Name'] || b['Department Name'] || '';
        return nameA.localeCompare(nameB);
      });
  }, [departments, searchTerm]);

    const paginatedDepartments = useMemo(() => {
      return filteredDepartments.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
      );
    }, [filteredDepartments, currentPage, itemsPerPage]);
  
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
  
    const totalPages = Math.ceil(filteredDepartments.length / itemsPerPage);

  // Memoized handlers
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setIsLoading(true);

      try {
        if (selectedDepartment) {
          // Edit existing chamber practice
          const department = departments.find((d) => d.id === selectedDepartment);
          if (department) {
            const practiceId = formData['Practice ID'] || formData['Department ID'] || department.id;
            const practiceName = formData['Practice Name'] || formData['Department Name'] || '';
            await updateDepartment({
              ...department,
              'Practice ID': practiceId,
              'Practice Name': practiceName,
            } as any);
            toast.success('Practice updated successfully');
          }
          setIsEditModalOpen(false);
        } else if (mode === 'select') {
          // Add existing department to hospital
          if (!formData.selectedDepartmentId) {
            toast.error('Please select a practice');
            setIsLoading(false);
            return;
          }
          console.log('Adding existing department:', formData.selectedDepartmentId);
          await addDepartment(formData.selectedDepartmentId);
          toast.success('Practice added to chamber');
          setIsAddModalOpen(false);
        } else {
          // Create new practice and add to chamber
          const practiceName = formData['Practice Name'] || formData['Department Name'] || '';
          if (!practiceName) {
            toast.error('Please enter a practice name');
            setIsLoading(false);
            return;
          }
          const newPracticeId = formData['Practice ID'] || formData['Department ID'] || crypto.randomUUID();
          console.log('Creating new practice:', { id: newPracticeId, name: practiceName });
          // Create practice with docid as Practice ID
          await setDoc(doc(db, 'Practice', newPracticeId), {
            'Practice ID': newPracticeId,
            'Practice Name': practiceName,
          });

          await addDepartment({
            id: newPracticeId,
            'Practice ID': newPracticeId,
            'Practice Name': practiceName,
          } as any);
          toast.success('New practice created and added to chamber');
          setIsAddModalOpen(false);
        }
        resetForm();
      } catch (err) {
        console.error('Failed to save department:', err);
        toast.error('Failed to save practice');
      } finally {
        setIsLoading(false);
      }
    },
    [
      formData,
      mode,
      selectedDepartment,
      departments,
      addDepartment,
      updateDepartment,
    ]
  );

  const handleDelete = useCallback(async () => {
    if (!selectedDepartment) return;
    setIsLoading(true);

    try {
      if (!deleteDepartment) {
        throw new Error('Delete functionality not implemented');
      }
      console.log('Deleting department:', selectedDepartment);
      await deleteDepartment(selectedDepartment);
      toast.success('Practice removed from chamber');
      setIsDeleteModalOpen(false);
      setSelectedDepartment(null);
    } catch (err) {
      console.error('Failed to delete department:', err);
      toast.error('Failed to remove practice');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDepartment, deleteDepartment]);

  const handleEdit = useCallback(
    (departmentId: string) => {
      const department = departments.find((d) => d.id === departmentId);
      if (department) {
        setFormData({
          'Practice ID': (department as any)['Practice ID'] || (department as any)['Department ID'] || department.id,
          'Department ID': (department as any)['Department ID'] || (department as any)['Practice ID'] || department.id, // Backward compatibility
          'Practice Name': (department as any)['Practice Name'] || (department as any)['Department Name'] || '',
          'Department Name': (department as any)['Department Name'] || (department as any)['Practice Name'] || '', // Backward compatibility
          selectedDepartmentId: '',
        });
        setSelectedDepartment(departmentId);
        setIsEditModalOpen(true);
      }
    },
    [departments]
  );

  const resetForm = useCallback(() => {
    setFormData({
      'Department ID': '',
      'Department Name': '',
      selectedDepartmentId: '',
    });
    setSelectedDepartment(null);
    setMode('select');
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    resetForm();
  }, [resetForm]);

  const closeEditModal = useCallback(() => {
    setIsEditModalOpen(false);
    resetForm();
  }, [resetForm]);

  const closeDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    setSelectedDepartment(null);
  }, []);

  return (
    <Layout>
      <div className="space-y-6 bg-gray-50 p-6 rounded-lg">
        {/* Header */}
        {isPageLoading ? (
          <HeaderSkeleton />
        ) : (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-teal-900">Practices</h1>
              <p className="mt-2 text-base text-gray-700">
                Manage chamber practices
              </p>
            </div>
            <Button
              onClick={() => {
                resetForm();
                setIsAddModalOpen(true);
              }}
              className="flex items-center bg-gray-600 hover:bg-gray-700 text-white"
            >
              <FolderPlus className="w-5 h-5 mr-2" />
              Add Practice
            </Button>
          </div>
        )}

        {/* Search Bar */}
        <div className="sticky top-0 z-10 bg-gray-50 py-4">
          {isPageLoading ? (
            <SearchSkeleton />
          ) : (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-teal-600" />
              <Input
                placeholder="Search practices..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-gray-100 border-gray-200 text-teal-900 placeholder-teal-600"
              />
            </div>
          )}
        </div>

        {/* Empty State */}
        {!isPageLoading && filteredDepartments.length === 0 && (
          <div className="text-center py-10">
            <p className="text-teal-600 text-lg">
              {searchTerm ? 'No practices found matching your search.' : 'No practices available.'}
            </p>
          </div>
        )}

        {/* Departments Table */}
        {isPageLoading ? (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head className="bg-gray-100 text-teal-900">Practice Name</Table.Head>
                  <Table.Head className="bg-gray-100 text-teal-900">Practice ID</Table.Head>
                  <Table.Head className="bg-gray-100 text-teal-900">Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {[...Array(5)].map((_, index) => (
                  <TableRowSkeleton key={index} />
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : filteredDepartments.length > 0 ? (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head className="bg-gray-100 text-teal-900">Practice Name</Table.Head>
                  <Table.Head className="bg-gray-100 text-teal-900">Practice ID</Table.Head>
                  <Table.Head className="bg-gray-100 text-teal-900">Actions</Table.Head>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {paginatedDepartments.map((department, index) => (
                  <Table.Row
                    key={department.id}
                    className={`${index % 2 === 0 ? 'bg-gray-50' : 'bg-white'} hover:bg-gray-100 transition-colors`}
                  >
                    <Table.Cell className="font-medium text-teal-900">
                      {(department as any)['Practice Name'] || (department as any)['Department Name'] || ''}
                    </Table.Cell>
                    <Table.Cell className="text-gray-700">{(department as any)['Practice ID'] || (department as any)['Department ID'] || department.id}</Table.Cell>
                    <Table.Cell>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(department.id)}
                          className="border-gray-200 text-gray-700 hover:bg-gray-200"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedDepartment(department.id);
                            setIsDeleteModalOpen(true);
                          }}
                          className="border-red-200 text-red-600 hover:bg-red-100"
                        >
                          <Trash className="w-4 h-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          </div>
        ) : null}

                        {filteredDepartments.length > itemsPerPage && (
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

        {/* Add Department Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={closeAddModal}
          title="Add Practice"
          size="lg"
        >
          {isPageLoading ? (
            <DepartmentFormSkeleton />
          ) : (
            <DepartmentForm
              formData={formData}
              setFormData={setFormData}
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              selectedDepartment={selectedDepartment}
              onCancel={closeAddModal}
              mode={mode}
              setMode={setMode}
              availableDepartments={availableDepartments}
            />
          )}
        </Modal>

        {/* Edit Department Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={closeEditModal}
          title="Edit Practice"
          size="lg"
        >
          {isPageLoading ? (
            <DepartmentFormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Practice Name"
                  value={formData['Practice Name'] || formData['Department Name'] || ''}
                  onChange={(e) => setFormData((prev: any) => ({
                    ...prev,
                    'Practice Name': e.target.value,
                    'Department Name': e.target.value,
                  }))}
                  required
                  className="bg-gray-50 border-gray-200 text-teal-900 placeholder-teal-600"
                  placeholder="e.g., Family Law"
                />
                <Input
                  label="Practice ID"
                  value={formData['Practice ID'] || formData['Department ID'] || ''}
                  onChange={(e) => setFormData((prev: any) => ({
                    ...prev,
                    'Practice ID': e.target.value,
                    'Department ID': e.target.value,
                  }))}
                  required
                  className="bg-gray-50 border-gray-200 text-teal-900 placeholder-teal-600"
                  placeholder="e.g., FAMILY123"
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEditModal}
                  className="border-gray-200 text-gray-700 hover:bg-gray-100"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-gray-600 hover:bg-gray-700 text-white"
                >
                  {isLoading ? 'Saving...' : 'Update Practice'}
                </Button>
              </div>
            </form>
          )}
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={isDeleteModalOpen}
          onClose={closeDeleteModal}
          title="Remove Practice"
          size="md"
        >
          <div className="space-y-6">
            <p className="text-gray-700">
              Are you sure you want to remove the practice "
              {((departments.find((d) => d.id === selectedDepartment) as any)?.['Practice Name'] || (departments.find((d) => d.id === selectedDepartment) as any)?.['Department Name'] || '')}" from the
              chamber? This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeDeleteModal}
                className="border-gray-200 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {isLoading ? 'Removing...' : 'Remove'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </Layout>
  );
};

export default DepartmentsPage;