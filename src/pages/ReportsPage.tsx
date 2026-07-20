import React, { useState, useEffect, useMemo } from 'react';
import { FileText, Users, Building2, Filter, BookOpen, FileBarChart, Printer, FileDown, UserPlus, LogIn } from 'lucide-react';
import Layout from '../components/layout/Layout';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import Table from '../components/ui/Table';
import { collection, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Users as UserType, Practice, Chamber } from '../types';
import { toast } from 'react-hot-toast';
import { Bar, Pie, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Report types
type ReportType = 'platform' | 'chamber' | 'practice' | 'users' | 'library' | 'summary';

interface ReportFilters {
  startDate: string;
  endDate: string;
  chamberId: string;
  practiceId: string;
  status: string;
  region: string;
}

interface LibraryItem {
  id: string;
  title: string;
  author: string;
  category: string;
  price: number;
  description: string;
  url: string;
  fileType: string;
  timestamp: Timestamp;
}

const ReportsPage: React.FC = () => {
  const [selectedReportType, setSelectedReportType] = useState<ReportType>('summary');
  const [filters, setFilters] = useState<ReportFilters>({
    startDate: '',
    endDate: '',
    chamberId: '',
    practiceId: '',
    status: '',
    region: '',
  });
  
  // Data states
  const [allUsers, setAllUsers] = useState<UserType[]>([]);
  const [allChambers, setAllChambers] = useState<Chamber[]>([]);
  const [allPractices, setAllPractices] = useState<Practice[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  // Fetch all data for platform reports
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Fetch all chambers
    const unsubChambers = onSnapshot(
      collection(db, 'Chamber'),
      (snapshot) => {
        const chambers = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Chamber[];
        setAllChambers(chambers);
      },
      (error) => console.error('Error fetching chambers:', error)
    );

    // Fetch all practices
    const unsubPractices = onSnapshot(
      collection(db, 'Practice'),
      (snapshot) => {
        const practices = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Practice[];
        setAllPractices(practices);
      },
      (error) => console.error('Error fetching practices:', error)
    );

    // Fetch all users
    const unsubUsers = onSnapshot(
      collection(db, 'Users'),
      (snapshot) => {
        const users = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as UserType[];
        setAllUsers(users);
      },
      (error) => console.error('Error fetching users:', error)
    );

    // Fetch library items
    const unsubLibrary = onSnapshot(
      collection(db, 'library'),
      (snapshot) => {
        const items = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as LibraryItem[];
        setLibraryItems(items);
      },
      (error) => console.error('Error fetching library:', error)
    );

    unsubscribers.push(unsubChambers, unsubPractices, unsubUsers, unsubLibrary);
    setLoading(false);

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }, []);

  // Filter data based on selected filters and report type
  const filteredData = useMemo(() => {
    let data: any[] = [];

    // Apply date filters if provided
    const startDate = filters.startDate ? new Date(filters.startDate) : null;
    const endDate = filters.endDate ? new Date(filters.endDate + 'T23:59:59') : null;

    switch (selectedReportType) {
      case 'platform':
        data = allChambers;
        break;
      case 'chamber':
        data = allChambers.filter((chamber) => {
          if (filters.chamberId && chamber.id !== filters.chamberId) return false;
          if (filters.region && chamber.Region !== filters.region) return false;
          return true;
        });
        break;
      case 'practice':
        let practices = allPractices;
        if (filters.practiceId) {
          practices = practices.filter((p) => p.id === filters.practiceId);
        }
        data = practices;
        break;
      case 'users':
        data = allUsers.filter((user) => {
          if (filters.chamberId && user['Chamber ID'] !== filters.chamberId) return false;
          if (filters.practiceId && user['Practice ID'] !== filters.practiceId) return false;
          if (filters.status && user.Status !== (filters.status === 'active')) return false;
          if (filters.region && user.Region !== filters.region) return false;
          if (startDate || endDate) {
            const createdAt = user.CreatedAt?.toDate();
            if (startDate && createdAt && createdAt < startDate) return false;
            if (endDate && createdAt && createdAt > endDate) return false;
          }
          return true;
        });
        break;
      case 'library':
        data = libraryItems.filter((item) => {
          if (filters.region && item.category !== filters.region) return false;
          if (startDate || endDate) {
            const timestamp = item.timestamp?.toDate();
            if (startDate && timestamp && timestamp < startDate) return false;
            if (endDate && timestamp && timestamp > endDate) return false;
          }
          return true;
        });
        break;
      case 'summary':
        // Summary includes aggregated stats
        data = [];
        break;
      default:
        data = [];
    }

    return data;
  }, [selectedReportType, filters, allUsers, allChambers, allPractices, libraryItems]);

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const activeUsers = allUsers.filter((u) => u.Status === true).length;
    const inactiveUsers = allUsers.length - activeUsers;
    const usersByRegion = allUsers.reduce((acc, user) => {
      const region = user.Region || 'Unknown';
      acc[region] = (acc[region] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const practicesByChamber = allChambers.reduce((acc, chamber) => {
      const practices = (chamber['Chamber Practice'] as string[]) || [];
      acc[chamber.id] = practices.length;
      return acc;
    }, {} as Record<string, number>);

    const libraryByCategory = libraryItems.reduce((acc, item) => {
      const category = item.category || 'Unknown';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate sign-up trends (last 30 days, grouped by day)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const signUpsByDay: Record<string, number> = {};
    const signInsByDay: Record<string, number> = {};

    allUsers.forEach((user) => {
      // Sign-up date
      if (user.CreatedAt) {
        const signUpDate = user.CreatedAt.toDate();
        const dateKey = signUpDate.toISOString().split('T')[0];
        if (signUpDate >= thirtyDaysAgo) {
          signUpsByDay[dateKey] = (signUpsByDay[dateKey] || 0) + 1;
        }
      }

      // Sign-in date (using lastSeen if available)
      if (user.lastSeen) {
        const signInDate = user.lastSeen.toDate();
        const dateKey = signInDate.toISOString().split('T')[0];
        if (signInDate >= thirtyDaysAgo) {
          signInsByDay[dateKey] = (signInsByDay[dateKey] || 0) + 1;
        }
      }
    });

    // Calculate rates (average per day over last 7 days and last 30 days)
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last7DaysSignUps = Object.entries(signUpsByDay).filter(([date]) => new Date(date) >= last7Days);
    const last7DaysSignIns = Object.entries(signInsByDay).filter(([date]) => new Date(date) >= last7Days);
    
    const signUpRate7Days = last7DaysSignUps.reduce((sum, [, count]) => sum + count, 0) / 7;
    const signUpRate30Days = Object.values(signUpsByDay).reduce((sum, count) => sum + count, 0) / 30;
    const signInRate7Days = last7DaysSignIns.reduce((sum, [, count]) => sum + count, 0) / 7;
    const signInRate30Days = Object.values(signInsByDay).reduce((sum, count) => sum + count, 0) / 30;

    // Generate trend data for charts (last 30 days)
    const trendLabels: string[] = [];
    const signUpTrendData: number[] = [];
    const signInTrendData: number[] = [];
    
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      const month = date.getMonth() + 1;
      const day = date.getDate();
      trendLabels.push(`${month}/${day}`);
      signUpTrendData.push(signUpsByDay[dateKey] || 0);
      signInTrendData.push(signInsByDay[dateKey] || 0);
    }

    return {
      totalChambers: allChambers.length,
      totalPractices: allPractices.length,
      totalUsers: allUsers.length,
      activeUsers,
      inactiveUsers,
      totalLibraryItems: libraryItems.length,
      usersByRegion,
      practicesByChamber,
      libraryByCategory,
      signUpRate7Days: Math.round(signUpRate7Days * 10) / 10,
      signUpRate30Days: Math.round(signUpRate30Days * 10) / 10,
      signInRate7Days: Math.round(signInRate7Days * 10) / 10,
      signInRate30Days: Math.round(signInRate30Days * 10) / 10,
      signUpTrend: {
        labels: trendLabels,
        data: signUpTrendData,
      },
      signInTrend: {
        labels: trendLabels,
        data: signInTrendData,
      },
    };
  }, [allChambers, allPractices, allUsers, libraryItems]);

  // Chart data generators
  const getUsersByRegionChartData = () => {
    return {
      labels: Object.keys(summaryStats.usersByRegion),
      datasets: [
        {
          label: 'Users by Region',
          data: Object.values(summaryStats.usersByRegion),
          backgroundColor: [
            'rgba(13, 148, 136, 0.8)',
            'rgba(15, 118, 110, 0.8)',
            'rgba(20, 184, 166, 0.8)',
            'rgba(153, 246, 228, 0.8)',
            'rgba(94, 234, 212, 0.8)',
          ],
        },
      ],
    };
  };

  const getPracticesByChamberChartData = () => {
    const chambers = allChambers.slice(0, 10); // Top 10 chambers
    return {
      labels: chambers.map((c) => c['Chamber Name'] || c.id),
      datasets: [
        {
          label: 'Practice areas per Chamber',
          data: chambers.map((c) => {
            const practices = (c['Chamber Practice'] as string[]) || [];
            return practices.length;
          }),
          backgroundColor: 'rgba(13, 148, 136, 0.8)',
        },
      ],
    };
  };

  const getLibraryByCategoryChartData = () => {
    return {
      labels: Object.keys(summaryStats.libraryByCategory),
      datasets: [
        {
          label: 'Library Items by Category',
          data: Object.values(summaryStats.libraryByCategory),
          backgroundColor: [
            'rgba(13, 148, 136, 0.8)',
            'rgba(15, 118, 110, 0.8)',
            'rgba(20, 184, 166, 0.8)',
            'rgba(153, 246, 228, 0.8)',
          ],
        },
      ],
    };
  };

  const getUsersStatusChartData = () => {
    return {
      labels: ['Active Users', 'Inactive Users'],
      datasets: [
        {
          label: 'User Status',
          data: [summaryStats.activeUsers, summaryStats.inactiveUsers],
          backgroundColor: ['rgba(16, 185, 129, 0.8)', 'rgba(239, 68, 68, 0.8)'],
        },
      ],
    };
  };

  const getSignUpTrendChartData = () => {
    return {
      labels: summaryStats.signUpTrend.labels,
      datasets: [
        {
          label: 'Sign-ups per Day',
          data: summaryStats.signUpTrend.data,
          borderColor: 'rgba(13, 148, 136, 1)',
          backgroundColor: 'rgba(13, 148, 136, 0.1)',
          tension: 0.4,
          fill: true,
        },
      ],
    };
  };

  const getSignInTrendChartData = () => {
    return {
      labels: summaryStats.signInTrend.labels,
      datasets: [
        {
          label: 'Sign-ins per Day',
          data: summaryStats.signInTrend.data,
          borderColor: 'rgba(20, 184, 166, 1)',
          backgroundColor: 'rgba(20, 184, 166, 0.1)',
          tension: 0.4,
          fill: true,
        },
      ],
    };
  };

  // Export functions
  const exportToCSV = () => {
    let csvContent = '';
    
    switch (selectedReportType) {
      case 'chamber':
        csvContent = 'Chamber Name,Location,City,Region,Contact,Practice areas Count\n';
        filteredData.forEach((chamber: Chamber) => {
          const practices = (chamber['Chamber Practice'] as string[]) || [];
          csvContent += `"${chamber['Chamber Name'] || ''}","${chamber.Location || ''}","${chamber.City || ''}","${chamber.Region || ''}","${chamber.Contact || ''}","${practices.length}"\n`;
        });
        break;
      case 'practice':
        csvContent = 'Practice area ID,Practice area name\n';
        filteredData.forEach((practice: Practice) => {
          csvContent += `"${practice['Practice ID'] || practice.id}","${practice['Practice Name'] || ''}"\n`;
        });
        break;
      case 'users':
        csvContent = 'User ID,First Name,Last Name,Email,Chamber ID,Practice ID,Title,Status,Region,Created At\n';
        filteredData.forEach((user: UserType) => {
          const createdAt = user.CreatedAt?.toDate().toLocaleDateString() || '';
          csvContent += `"${user['User ID'] || user.id}","${user.Fname || ''}","${user.Lname || ''}","${user.Email || ''}","${user['Chamber ID'] || ''}","${user['Practice ID'] || ''}","${user.Title || ''}","${user.Status ? 'Active' : 'Inactive'}","${user.Region || ''}","${createdAt}"\n`;
        });
        break;
      case 'library':
        csvContent = 'Title,Author,Category,Price,Description,File Type\n';
        filteredData.forEach((item: LibraryItem) => {
          csvContent += `"${item.title || ''}","${item.author || ''}","${item.category || ''}","${item.price || 0}","${item.description || ''}","${item.fileType || ''}"\n`;
        });
        break;
      default:
        toast.error('CSV export not available for this report type');
        return;
    }

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedReportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success('CSV exported successfully!');
  };

  const exportToPDF = () => {
    // For now, use browser print functionality
    window.print();
    toast.success('Opening print dialog...');
  };

  const handleFilterChange = (key: keyof ReportFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const resetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      chamberId: '',
      practiceId: '',
      status: '',
      region: '',
    });
  };

  // Get unique regions from users
  const uniqueRegions = useMemo(() => {
    const regions = new Set<string>();
    allUsers.forEach((user) => {
      if (user.Region) regions.add(user.Region);
    });
    return Array.from(regions).sort();
  }, [allUsers]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-700">Loading report data...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Reports</h1>
            <p className="mt-2 text-base text-gray-700">
              Generate comprehensive reports on chambers, practice areas, users, and library resources
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            {filteredData.length > 0 && (
              <>
                <Button
                  variant="outline"
                  onClick={exportToCSV}
                  className="flex items-center gap-2"
                >
                  <FileDown className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  onClick={exportToPDF}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900"
                >
                  <Printer className="h-4 w-4" />
                  Print/PDF
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Report Type Selector */}
        <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Report Type
          </label>
          <Select
            value={selectedReportType}
            onChange={(value) => setSelectedReportType(value as ReportType)}
            options={[
              { value: 'summary', label: 'Platform Summary' },
              { value: 'platform', label: 'All Chambers' },
              { value: 'chamber', label: 'Chamber Details' },
              { value: 'practice', label: 'Practice area report' },
              { value: 'users', label: 'Users/Staff Report' },
              { value: 'library', label: 'Library Report' },
            ]}
          />
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Filters</h3>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Input
                type="date"
                label="Start Date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange('startDate', e.target.value)}
              />
              <Input
                type="date"
                label="End Date"
                value={filters.endDate}
                onChange={(e) => handleFilterChange('endDate', e.target.value)}
              />
              {(selectedReportType === 'chamber' || selectedReportType === 'users') && (
                <Select
                  label="Chamber"
                  value={filters.chamberId}
                  onChange={(value) => handleFilterChange('chamberId', value)}
                  options={[
                    { value: '', label: 'All Chambers' },
                    ...allChambers.map((chamber) => ({
                      value: chamber.id,
                      label: chamber['Chamber Name'] || chamber.id,
                    })),
                  ]}
                />
              )}
              {(selectedReportType === 'practice' || selectedReportType === 'users') && (
                <Select
                  label="Practice area"
                  value={filters.practiceId}
                  onChange={(value) => handleFilterChange('practiceId', value)}
                  options={[
                    { value: '', label: 'All practice areas' },
                    ...allPractices.map((practice) => ({
                      value: practice.id,
                      label: practice['Practice Name'] || practice.id,
                    })),
                  ]}
                />
              )}
              {selectedReportType === 'users' && (
                <Select
                  label="Status"
                  value={filters.status}
                  onChange={(value) => handleFilterChange('status', value)}
                  options={[
                    { value: '', label: 'All Status' },
                    { value: 'active', label: 'Active' },
                    { value: 'inactive', label: 'Inactive' },
                  ]}
                />
              )}
              {(selectedReportType === 'users' || selectedReportType === 'chamber') && (
                <Select
                  label="Region"
                  value={filters.region}
                  onChange={(value) => handleFilterChange('region', value)}
                  options={[
                    { value: '', label: 'All Regions' },
                    ...uniqueRegions.map((region) => ({
                      value: region,
                      label: region,
                    })),
                  ]}
                />
              )}
            </div>
          </div>
        )}

        {/* Summary Report */}
        {selectedReportType === 'summary' && (
          <div className="space-y-6">
            {/* Summary Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Chambers</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.totalChambers}</p>
                  </div>
                  <Building2 className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total practice areas</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.totalPractices}</p>
                  </div>
                  <FileText className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Users</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.totalUsers}</p>
                  </div>
                  <Users className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Library Items</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.totalLibraryItems}</p>
                  </div>
                  <BookOpen className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
            </div>

            {/* Sign-up and Sign-in Rate Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Sign-up Rate (7 days)</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.signUpRate7Days}</p>
                    <p className="text-xs text-gray-500 mt-1">users/day avg</p>
                  </div>
                  <UserPlus className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Sign-up Rate (30 days)</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.signUpRate30Days}</p>
                    <p className="text-xs text-gray-500 mt-1">users/day avg</p>
                  </div>
                  <UserPlus className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Sign-in Rate (7 days)</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.signInRate7Days}</p>
                    <p className="text-xs text-gray-500 mt-1">users/day avg</p>
                  </div>
                  <LogIn className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
              <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Sign-in Rate (30 days)</p>
                    <p className="text-3xl font-bold text-gray-900">{summaryStats.signInRate30Days}</p>
                    <p className="text-xs text-gray-500 mt-1">users/day avg</p>
                  </div>
                  <LogIn className="h-12 w-12 text-gray-600 opacity-50" />
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sign-up Trends (Last 30 Days)</h3>
                <div className="h-64">
                  <Line 
                    data={getSignUpTrendChartData()} 
                    options={{ 
                      maintainAspectRatio: false,
                      scales: {
                        x: { 
                          grid: { color: '#ccfbf1' },
                          ticks: { maxRotation: 45, minRotation: 45 }
                        },
                        y: { 
                          beginAtZero: true, 
                          grid: { color: '#ccfbf1' },
                          ticks: { stepSize: 1 }
                        },
                      },
                      plugins: {
                        legend: { display: false },
                        tooltip: { backgroundColor: '#0f766e' },
                      },
                      elements: {
                        line: { tension: 0.4, borderWidth: 2 },
                        point: { radius: 3, hoverRadius: 5 },
                      },
                    }} 
                  />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Sign-in Trends (Last 30 Days)</h3>
                <div className="h-64">
                  <Line 
                    data={getSignInTrendChartData()} 
                    options={{ 
                      maintainAspectRatio: false,
                      scales: {
                        x: { 
                          grid: { color: '#ccfbf1' },
                          ticks: { maxRotation: 45, minRotation: 45 }
                        },
                        y: { 
                          beginAtZero: true, 
                          grid: { color: '#ccfbf1' },
                          ticks: { stepSize: 1 }
                        },
                      },
                      plugins: {
                        legend: { display: false },
                        tooltip: { backgroundColor: '#0f766e' },
                      },
                      elements: {
                        line: { tension: 0.4, borderWidth: 2 },
                        point: { radius: 3, hoverRadius: 5 },
                      },
                    }} 
                  />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Users by Region</h3>
                <div className="h-64">
                  <Bar data={getUsersByRegionChartData()} options={{ maintainAspectRatio: false }} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">User Status Distribution</h3>
                <div className="h-64">
                  <Pie data={getUsersStatusChartData()} options={{ maintainAspectRatio: false }} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Practice areas per Chamber (Top 10)</h3>
                <div className="h-64">
                  <Bar data={getPracticesByChamberChartData()} options={{ maintainAspectRatio: false }} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Library Items by Category</h3>
                <div className="h-64">
                  <Pie data={getLibraryByCategoryChartData()} options={{ maintainAspectRatio: false }} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Detailed Reports */}
        {selectedReportType !== 'summary' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {selectedReportType === 'platform' && 'All Chambers'}
                {selectedReportType === 'chamber' && 'Chamber Details'}
                {selectedReportType === 'practice' && 'Practice area report'}
                {selectedReportType === 'users' && 'Users/Staff Report'}
                {selectedReportType === 'library' && 'Library Report'}
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {filteredData.length} {filteredData.length === 1 ? 'item' : 'items'} found
              </p>
            </div>

            <div className="overflow-x-auto">
              {(selectedReportType === 'chamber' || selectedReportType === 'platform') && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Chamber Name</Table.Head>
                      <Table.Head>Location</Table.Head>
                      <Table.Head>City</Table.Head>
                      <Table.Head>Region</Table.Head>
                      <Table.Head>Contact</Table.Head>
                      <Table.Head>Practice areas</Table.Head>
                      <Table.Head>Rating</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredData.map((chamber: Chamber) => {
                      const practices = (chamber['Chamber Practice'] as string[]) || [];
                      return (
                        <Table.Row key={chamber.id}>
                          <Table.Cell className="font-medium">{chamber['Chamber Name'] || chamber.id}</Table.Cell>
                          <Table.Cell>{chamber.Location || 'N/A'}</Table.Cell>
                          <Table.Cell>{chamber.City || 'N/A'}</Table.Cell>
                          <Table.Cell>{chamber.Region || 'N/A'}</Table.Cell>
                          <Table.Cell>{chamber.Contact || 'N/A'}</Table.Cell>
                          <Table.Cell>{practices.length}</Table.Cell>
                          <Table.Cell>
                            {chamber.averageRating ? `${chamber.averageRating.toFixed(1)} ⭐` : 'N/A'}
                          </Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
              )}
              {selectedReportType === 'practice' && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Practice area ID</Table.Head>
                      <Table.Head>Practice area name</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredData.map((practice: Practice) => (
                      <Table.Row key={practice.id}>
                        <Table.Cell className="font-medium">{practice['Practice ID'] || practice.id}</Table.Cell>
                        <Table.Cell>{practice['Practice Name'] || 'N/A'}</Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table>
              )}
              {selectedReportType === 'users' && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Name</Table.Head>
                      <Table.Head>Email</Table.Head>
                      <Table.Head>Title</Table.Head>
                      <Table.Head>Chamber</Table.Head>
                      <Table.Head>Practice area</Table.Head>
                      <Table.Head>Region</Table.Head>
                      <Table.Head>Status</Table.Head>
                      <Table.Head>Created At</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredData.map((user: UserType) => {
                      const chamber = allChambers.find((c) => c.id === user['Chamber ID']);
                      const practice = allPractices.find((p) => p.id === user['Practice ID']);
                      const createdAt = user.CreatedAt?.toDate().toLocaleDateString() || 'N/A';
                      return (
                        <Table.Row key={user.id}>
                          <Table.Cell className="font-medium">
                            {user.Fname} {user.Lname}
                          </Table.Cell>
                          <Table.Cell>{user.Email || 'N/A'}</Table.Cell>
                          <Table.Cell>{user.Title || 'N/A'}</Table.Cell>
                          <Table.Cell>{chamber?.['Chamber Name'] || user['Chamber ID'] || 'N/A'}</Table.Cell>
                          <Table.Cell>{practice?.['Practice Name'] || user['Practice ID'] || 'N/A'}</Table.Cell>
                          <Table.Cell>{user.Region || 'N/A'}</Table.Cell>
                          <Table.Cell>
                            <span
                              className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                user.Status
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {user.Status ? 'Active' : 'Inactive'}
                            </span>
                          </Table.Cell>
                          <Table.Cell>{createdAt}</Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
              )}
              {selectedReportType === 'library' && (
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.Head>Title</Table.Head>
                      <Table.Head>Author</Table.Head>
                      <Table.Head>Category</Table.Head>
                      <Table.Head>Price</Table.Head>
                      <Table.Head>File Type</Table.Head>
                      <Table.Head>Added Date</Table.Head>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {filteredData.map((item: LibraryItem) => {
                      const addedDate = item.timestamp?.toDate().toLocaleDateString() || 'N/A';
                      return (
                        <Table.Row key={item.id}>
                          <Table.Cell className="font-medium">{item.title || 'N/A'}</Table.Cell>
                          <Table.Cell>{item.author || 'N/A'}</Table.Cell>
                          <Table.Cell>{item.category || 'N/A'}</Table.Cell>
                          <Table.Cell>${item.price || 0}</Table.Cell>
                          <Table.Cell>{item.fileType || 'N/A'}</Table.Cell>
                          <Table.Cell>{addedDate}</Table.Cell>
                        </Table.Row>
                      );
                    })}
                  </Table.Body>
                </Table>
              )}
            </div>

            {filteredData.length === 0 && (
              <div className="p-8 text-center text-gray-600">
                <FileBarChart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No data found matching your filters</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ReportsPage;
