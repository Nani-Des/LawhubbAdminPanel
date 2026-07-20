import React, { useEffect, useState } from 'react';
import {
  FileText,
  FolderPlus,
  CircleUser,
  FilePlus2,
  Users,
  FileBarChart
} from 'lucide-react';
import { useChamber } from '../contexts/ChamberContext';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/layout/Layout';
import ActionCard from '../components/dashboard/ActionCard';
import NotificationPreview from '../components/dashboard/NotificationPreview';
import { db, storage } from '../firebase';
import { collection, documentId, getCountFromServer, query, where } from 'firebase/firestore';
import { ref, listAll } from 'firebase/storage';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
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
  Title,
  Tooltip,
  Legend
);

// Skeleton Loading Components
const MetricSkeleton = () => (
  <div className="bg-gray-100 p-6 rounded-lg shadow-md border border-gray-200 animate-pulse">
    <div className="flex items-center mb-4">
      <div className="h-6 w-6 bg-gray-300 rounded-full"></div>
      <div className="ml-2 h-6 w-32 bg-gray-300 rounded"></div>
    </div>
    <div className="h-32 bg-gray-300 rounded"></div>
  </div>
);

const ActionHeaderSkeleton = () => (
    <div className="animate-pulse">
    <div className="h-8 w-32 bg-gray-300 rounded-lg mb-2"></div>
  </div>
)

const QuickActionSkeleton = () => (
  <div className="bg-gray-200 p-5 rounded-xl shadow-sm animate-pulse h-full">
    <div className="flex items-start">
      <div className="p-2 bg-gray-400/20 rounded-lg mr-4">
        <div className="h-6 w-6 bg-gray-400/50 rounded-full"></div>
      </div>
      <div className="flex-1">
        <div className="h-6 w-24 bg-gray-400/50 rounded mb-2"></div>
        <div className="h-4 w-32 bg-gray-400/30 rounded"></div>
      </div>
    </div>
  </div>
);

const WelcomeSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-8 w-64 bg-gray-300 rounded-lg mb-2"></div>
    <div className="h-4 w-80 bg-gray-300 rounded-md"></div>
  </div>
);

const DashboardPage: React.FC = () => {
  const { chamber, notifications } = useChamber();
  const { currentAdmin } = useAuth();
  const [metrics, setMetrics] = useState({
    totalAttachments: 0,
    totalPractices: 0,
    totalUsers: 0,
  });
  const [loading, setLoading] = useState(true);

  // Helper function to check if user has permission
  const hasPermission = (permissionKey: string): boolean => {
    if (!currentAdmin?.permissions) return false;
    
    // If permissions is an array of strings
    if (Array.isArray(currentAdmin.permissions)) {
      return currentAdmin.permissions.includes(permissionKey);
    }
    
    // If permissions is an object with boolean values
    if (typeof currentAdmin.permissions === 'object') {
      return currentAdmin.permissions[permissionKey] === true;
    }
    
    return false;
  };

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const practiceIds = chamber?.['Chamber Practice'];

        if (!chamber?.id || !practiceIds || practiceIds.length === 0) return;

        const countFilesInStorage = async (folderPath: string): Promise<number> => {
          const folderRef = ref(storage, folderPath);
          const list = await listAll(folderRef);
          return list.items.length;
        };

        const [fileCount, deptSnap, usersSnap] = await Promise.all([
          countFilesInStorage('referral_files'),
          getCountFromServer(
            query(collection(db, 'Practice'), where(documentId(), 'in', practiceIds))
          ),
          getCountFromServer(
            query(collection(db, 'Users'), where('Role', '==', true), where('Chamber ID', '==', chamber.id))
          ),
        ]);

        setMetrics({
          totalAttachments: fileCount,
          totalPractices: deptSnap.data().count,
          totalUsers: usersSnap.data().count,
        });
      } catch (err) {
        console.error('Failed to fetch metrics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [chamber]);

  // Mock platform averages for comparison
  const platformAverages = {
    totalAttachments: 75,
    totalPractices: 15,
    totalUsers: 20,
  };

  // Chart options for bar charts (Attachments, Practices)
  const barChartOptions = {
    indexAxis: 'y' as const,
    scales: {
      x: { beginAtZero: true, grid: { color: '#e5e7eb' } },
      y: { grid: { display: false } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#374151' },
    },
    maintainAspectRatio: false,
  };

  // Chart options for line graph (members)
  const lineChartOptions = {
    scales: {
      x: { grid: { color: '#e5e7eb' } },
      y: { beginAtZero: true, grid: { color: '#e5e7eb' } },
    },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#374151' },
    },
    maintainAspectRatio: false,
    elements: {
      line: { tension: 0.4, borderWidth: 2 },
      point: { radius: 5, hoverRadius: 7 },
    },
  };

  // Chart data for Attachments (Bar)
  const attachmentsData = {
    labels: ['Your Chamber', 'Platform Average'],
    datasets: [
      {
        label: 'Attachments',
        data: [metrics.totalAttachments, platformAverages.totalAttachments],
        backgroundColor: ['#374151', '#9ca3af'],
        borderColor: ['#1f2937', '#6b7280'],
        borderWidth: 1,
      },
    ],
  };

  // Chart data for Practices (Bar)
  const practicesData = {
    labels: ['Your Chamber', 'Platform Average'],
    datasets: [
      {
        label: 'Practice area',
        data: [metrics.totalPractices, platformAverages.totalPractices],
        backgroundColor: ['#374151', '#9ca3af'],
        borderColor: ['#1f2937', '#6b7280'],
        borderWidth: 1,
      },
    ],
  };

  // Chart data for members (Line)
  const lawyersData = {
    labels: ['Your Chamber', 'Platform Average'],
    datasets: [
      {
        label: 'Members',
        data: [metrics.totalUsers, platformAverages.totalUsers],
        borderColor: '#374151',
        backgroundColor: '#374151',
        pointBackgroundColor: '#374151',
        pointBorderColor: '#1f2937',
        pointHoverBackgroundColor: '#6b7280',
        fill: false,
      },
    ],
  };

  return (
    <Layout>
      <div className="space-y-8 bg-gradient-to-br from-white to-gray-50 p-8 rounded-2xl shadow-sm border border-gray-100">
        {/* Welcome section */}
        {loading ? (
          <WelcomeSkeleton />
        ) : (
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Welcome to {chamber?.['Chamber Name']} Admin Panel
            </h1>
            <p className="mt-2 text-base text-gray-700">
              Monitor and manage your law chamber's operations with real-time insights.
            </p>
          </div>
        )}

        {/* Metrics section with charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {loading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="flex items-center mb-4">
                  <FileText className="h-6 w-6 text-gray-700" />
                  <h3 className="ml-2 text-lg font-semibold text-gray-900">Attachments</h3>
                </div>
                <div className="h-32">
                  <Bar data={attachmentsData} options={barChartOptions} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="flex items-center mb-4">
                  <FolderPlus className="h-6 w-6 text-gray-700" />
                  <h3 className="ml-2 text-lg font-semibold text-gray-900">Practice area</h3>
                </div>
                <div className="h-32">
                  <Bar data={practicesData} options={barChartOptions} />
                </div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-shadow duration-200">
                <div className="flex items-center mb-4">
                  <CircleUser className="h-6 w-6 text-gray-700" />
                  <h3 className="ml-2 text-lg font-semibold text-gray-900">Members</h3>
                </div>
                <div className="h-32">
                  <Line data={lawyersData} options={lineChartOptions} />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Quick actions section */}
        <div>
                 {loading ? (
          <ActionHeaderSkeleton />
        ) : (
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Quick Actions</h2>
        )}
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              <>
                <QuickActionSkeleton />
                <QuickActionSkeleton />
                <QuickActionSkeleton />
                <QuickActionSkeleton />
                <QuickActionSkeleton />
                <QuickActionSkeleton />
              </>
            ) : (
              <>
                {hasPermission('practices') && (
                  <ActionCard
                    title="Manage practice areas"
                    description="Manage practice areas in your chamber"
                    icon={<FolderPlus className="h-6 w-6 text-white" />}
                    path="/practices"
                  />
                )}
                {hasPermission('shift_schedule') && (
                  <>
                    <ActionCard
                    title="Shift Schedule"
                    description="Manage member shift schedules"
                      icon={<Users className="h-6 w-6 text-white" />}
                      path="/shift-schedule"
                    />
                    <ActionCard
                      title="Shift Roster"
                      description="Manage practice rosters"
                      icon={<Users className="h-6 w-6 text-white" />}
                      path="/shift-schedule"
                    />
                  </>
                )}
                {hasPermission('medical_records') && (
                  <ActionCard
                    title="View Attachments"
                    description="Access client attachments"
                    icon={<FileText className="h-6 w-6 text-white" />}
                    path="/attachments"
                  />
                )}
                {hasPermission('lawyers') && (
                  <ActionCard
                    title="Manage Members"
                    description="Manage member profiles"
                    icon={<CircleUser className="h-6 w-6 text-white" />}
                    path="/lawyers"
                  />
                )}
                {hasPermission('services') && (
                  <ActionCard
                    title="Manage Services"
                    description="Manage legal services and offerings"
                    icon={<FilePlus2 className="h-6 w-6 text-white" />}
                    path="/services"
                  />
                )}
                {currentAdmin?.baseRole === 'main_admin' && (
                  <ActionCard
                    title="Generate Reports"
                    description="Generate comprehensive reports on staff and clients"
                    icon={<FileBarChart className="h-6 w-6 text-white" />}
                    path="/reports"
                  />
                )}
              </>
            )}
          </div>
        </div>

        {/* Notifications preview */}
        {!loading && <NotificationPreview notifications={notifications} />}
      </div>
    </Layout>
  );
};

export default DashboardPage;