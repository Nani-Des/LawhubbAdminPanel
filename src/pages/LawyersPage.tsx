import React, { useEffect, useMemo, useState } from "react";
import { Plus, Edit, Calendar, Lock, UserX, UserCheck, X, Shield, ShieldOff, Upload } from "lucide-react";
import { useHospital } from "../contexts/HospitalContext";
import Layout from "../components/layout/Layout";
import Button from "../components/ui/Button";
import Modal from "../components/ui/Modal";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import BulkUploadModal from "../components/lawyers/BulkUploadModal";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../firebase";
import { ref, uploadBytes, getDownloadURL } from "@firebase/storage";
import { storage } from "../firebase";
import { Schedule } from "../types";
import { toast } from "react-hot-toast";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  updateEmail,
  updatePassword,
  getAuth,
  deleteUser,
} from "firebase/auth";
import { auth } from "../firebase";

// Skeleton Loading Components
const LawyerCardSkeleton = () => (
  <div className="bg-gray-100 p-6 rounded-lg shadow-md border-2 border-gray-200 animate-pulse">
    <div className="flex items-center space-x-4">
      <div className="h-12 w-12 rounded-full bg-gray-200"></div>
      <div className="space-y-2">
        <div className="h-4 w-32 bg-gray-200 rounded"></div>
        <div className="h-3 w-24 bg-gray-200 rounded"></div>
      </div>
    </div>
    <div className="mt-4 space-y-2">
      <div className="h-3 w-3/4 bg-gray-200 rounded"></div>
      <div className="h-3 w-1/2 bg-gray-200 rounded"></div>
      <div className="flex flex-wrap gap-2 mt-2">
        <div className="h-8 w-20 bg-gray-200 rounded"></div>
        <div className="h-8 w-16 bg-gray-200 rounded"></div>
        <div className="h-8 w-20 bg-gray-200 rounded"></div>
        <div className="h-8 w-24 bg-gray-200 rounded"></div>
      </div>
    </div>
  </div>
);

const HeaderSkeleton = () => (
  <div className="animate-pulse">
    <div className="h-8 w-64 bg-gray-200 rounded mb-2"></div>
    <div className="h-4 w-80 bg-gray-200 rounded"></div>
    <div className="h-10 w-40 bg-gray-200 rounded mt-4"></div>
  </div>
);

const SearchSkeleton = () => (
  <div className="max-w-md h-10 bg-gray-200 rounded animate-pulse"></div>
);

const FormSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="h-24 bg-gray-200 rounded"></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="h-12 bg-gray-300 rounded"></div>
  </div>
);

const ScheduleFormSkeleton = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="h-16 bg-gray-200 rounded"></div>
      <div className="h-16 bg-gray-200 rounded"></div>
    </div>
    <div className="h-16 bg-gray-200 rounded"></div>
    <div className="flex justify-between">
      <div className="h-10 w-24 bg-gray-200 rounded"></div>
      <div className="h-10 w-32 bg-gray-300 rounded"></div>
    </div>
  </div>
);

const LawyersPage: React.FC = () => {
  const {
    users: contextUsers,
    departments,
    addUser,
    updateUser,
    hospital,
  } = useHospital();
  const [users, setUsers] = useState(contextUsers);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false);
  const [isScheduleLoading, setIsScheduleLoading] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] =
    useState(false);
  const [isMakeAdminModalOpen, setIsMakeAdminModalOpen] = useState(false);
  const [isRemoveAdminModalOpen, setIsRemoveAdminModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [userSchedules, setUserSchedules] = useState<Record<string, Schedule>>(
    {}
  );
  const [formStep, setFormStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [formData, setFormData] = useState({
    Fname: "",
    Lname: "",
    Email: "",
    "Mobile Number": "",
    "Chamber ID": hospital?.id ?? "",
    Title: "",
    Designation: "",
    "Practice ID": "",
    Role: true,
    Status: true,
    Region: "",
    "User Pic": "",
     Experience: 1,
  });
  const [scheduleData, setScheduleData] = useState({
    "Active Days": 0,
    "Off Days": 0,
    Shift: 0,
    "Shift Start": Timestamp.fromDate(new Date()),
    "Shift Switch": 0,
  });
  const [newPassword, setNewPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 9;

  // Set default Practice ID when practices load or add modal opens
  useEffect(() => {
    if (
      departments.length > 0 &&
      !formData["Practice ID"] &&
      isAddModalOpen
    ) {
      setFormData((prev) => ({
        ...prev,
        "Practice ID": departments[0]?.["Practice ID"] || departments[0]?.["Department ID"] || departments[0]?.id || "",
      }));
    }
  }, [departments, isAddModalOpen]);

  // Fetch users, only those with matching Hospital ID
  useEffect(() => {
    if (!hospital?.id) {
      console.warn("No hospital ID available. Cannot fetch lawyers.");
      setUsers([]);
      setIsPageLoading(false);
      return;
    }

    const filterUsers = (users: any[]) =>
      users.filter((user) => user["Chamber ID"] === hospital.id);

    if (
      contextUsers.some(
        (user) => user.Status === false && user["Chamber ID"] === hospital.id
      )
    ) {
      setUsers(filterUsers(contextUsers));
      setIsPageLoading(false);
    } else {
      console.warn(
        "useHospital may be filtering users. Fetching directly from Firestore."
      );
      const unsub = onSnapshot(
        collection(db, "Users"),
        (snapshot) => {
          const fetchedUsers = filterUsers(
            snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
          );
          if (fetchedUsers.length === 0) {
            console.warn(`No users found with Hospital ID: ${hospital.id}`);
          }
          setUsers(fetchedUsers);
          setIsPageLoading(false);
        },
        (error) => {
          console.error("Error fetching users:", error);
          toast.error("Failed to fetch lawyers");
          setIsPageLoading(false);
        }
      );
      return () => unsub();
    }
  }, [contextUsers, hospital?.id]);

  const filteredUsers = users.filter(
    (user) =>
      user["Chamber ID"] === hospital?.id &&
        (user.Fname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.Lname.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (departments
          .find((d) => d.id === user["Practice ID"] || d["Practice ID"] === user["Practice ID"] || d.id === user["Department ID"])
          ?.["Practice Name"] || departments.find((d) => d.id === user["Department ID"])?.["Department Name"] || "")
          .toLowerCase()
          .includes(searchTerm.toLowerCase()))
  );

  const paginatedUsers = useMemo(() => {
    return filteredUsers.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage
    );
  }, [filteredUsers, currentPage, itemsPerPage]);

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

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);

  // Available permissions for admin assignment
  const availablePermissions = [
    { key: "departments", label: "Practices" },
    { key: "medical_records", label: "Attachments" },
    { key: "lawyers", label: "Lawyers" },
    { key: "shift_schedule", label: "Shift Schedule" },
    { key: "services", label: "Services" },
    { key: "referrals", label: "Referrals" },
    { key: "notifications", label: "Notifications" },
  ];

  const Title = ["Select a title", "Esq.", "Mr.", "Mrs.", "Miss.", "Dr."];
  const Region = [
    "Select a region",
    "Western North",
    "Western",
    "Oti",
    "Bono",
    "Bono East",
    "Ahafo",
    "Greater Accra",
    "Eastern",
    "Central",
    "Northern",
    "Savannah",
    "North East",
    "Volta",
    "Upper East",
    "Upper West",
    "Ashanti",
  ];

  useEffect(() => {
    async function fetchSchedules() {
      const newUserSchedules: Record<string, Schedule> = {};
      for (const user of users) {
        const scheduleCollectionRef = collection(
          db,
          "Users",
          user.id,
          "Schedule"
        );
        const querySnapshot = await getDocs(scheduleCollectionRef);
        if (!querySnapshot.empty) {
          const docData = querySnapshot.docs[0].data() as Schedule;
          newUserSchedules[user.id] = docData;
        }
      }
      setUserSchedules(newUserSchedules);
    }

    if (users.length > 0) {
      fetchSchedules();
    }
  }, [users]);

  const loadScheduleData = async (userId: string) => {
    setIsScheduleLoading(true);
    try {
      const scheduleCollectionRef = collection(db, "Users", userId, "Schedule");
      const querySnapshot = await getDocs(scheduleCollectionRef);

      if (!querySnapshot.empty) {
        const docData = querySnapshot.docs[0].data() as Schedule;
        setScheduleData({
          "Active Days": docData["Active Days"] || 0,
          "Off Days": docData["Off Days"] || 0,
          Shift: docData.Shift || 0,
          "Shift Start":
            docData["Shift Start"] || Timestamp.fromDate(new Date()),
          "Shift Switch": docData["Shift Switch"] || 0,
        });
      } else {
        // Set default values if no schedule exists
        setScheduleData({
          "Active Days": 0,
          "Off Days": 0,
          Shift: 0,
          "Shift Start": Timestamp.fromDate(new Date()),
          "Shift Switch": 0,
        });
      }
    } catch (error) {
      console.error("Error loading schedule:", error);
      toast.error("Failed to load schedule");
    } finally {
      setIsScheduleLoading(false);
    }
  };

  // Handle image selection and preview
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ["image/jpeg", "image/png", "image/gif"];
      if (!validTypes.includes(file.type)) {
        toast.error("Please upload a JPEG, PNG, or GIF image");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Image size must be less than 5MB");
        return;
      }

      setSelectedImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setFormData((prev) => ({ ...prev, "User Pic": "" }));
  };

  const uploadImage = async (userId: string): Promise<string | null> => {
    if (!selectedImage || !hospital?.id) return null;

    try {
      const timestamp = Date.now();
      const fileName = `lawyer_${timestamp}_${selectedImage.name}`;
      const storageRef = ref(
        storage,
        `${hospital.id}/lawyers/${userId}/${fileName}`
      );
      await uploadBytes(storageRef, selectedImage);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (err) {
      console.error("Failed to upload image:", err);
      toast.error("Failed to upload image");
      return null;
    }
  };

  const generateRandomPassword = () => {
    let password = "";
    for (let i = 0; i < 6; i++) {
      password += Math.floor(Math.random() * 10); // adds a digit between 0–9
    }
    return password;
  };

  const handleDisableEnable = async (userId: string, enable: boolean) => {
    setIsLoading(true);
    try {
      const user = users.find((u) => u.id === userId);
      if (!user) return;

      await updateUser({
        ...user,
        Role: enable,
        Status: enable,
      });

      toast.success(`User ${user.Email} ${enable ? "enabled" : "disabled"}`);
    } catch (err) {
      console.error(`Failed to ${enable ? "enable" : "disable"} lawyer:`, err);
      toast.error(`Failed to ${enable ? "enable" : "disable"} lawyer`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const user = users.find((u) => u.id === selectedUser);
      if (!user) return;

      const authUser = await getAuth().currentUser;

      if (authUser) {
        await updatePassword(authUser, newPassword);
        toast.success(`Password reset for ${user.Email}`);
        setIsResetPasswordModalOpen(false);
        setNewPassword("");
      } else {
        throw new Error("User not authenticated");
      }
    } catch (err) {
      console.error("Failed to reset password:", err);
      toast.error("Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const handleMakeAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedPermissions.length === 0) {
      toast.error("Please select at least one permission");
      return;
    }

    setIsLoading(true);
    try {
      const user = users.find((u) => u.id === selectedUser);
      if (!user) return;

      // Prevent making changes to hospital_admin users
      if ((user as any).baseRole === "hospital_admin") {
        toast.error("Cannot modify admin status for hospital_admin users");
        setIsMakeAdminModalOpen(false);
        setSelectedPermissions([]);
        setSelectedUser(null);
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, "Users", user.id);
      await updateDoc(userRef, {
        baseRole: "hospital_manager", // Only hospital_manager can be assigned, not main_admin
        Permissions: selectedPermissions,
        hospitalId: hospital?.id || user["Chamber ID"],
      });

      toast.success(`${user.Fname} ${user.Lname} is now an admin`);
      setIsMakeAdminModalOpen(false);
      setSelectedPermissions([]);
      setSelectedUser(null);
    } catch (err) {
      console.error("Failed to make admin:", err);
      toast.error("Failed to make admin");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveAdmin = async () => {
    setIsLoading(true);
    try {
      const user = users.find((u) => u.id === selectedUser);
      if (!user) return;

      // Prevent removing admin status from hospital_admin users
      if ((user as any).baseRole === "hospital_admin") {
        toast.error("Cannot remove admin status from hospital_admin users");
        setIsRemoveAdminModalOpen(false);
        setSelectedUser(null);
        setIsLoading(false);
        return;
      }

      const userRef = doc(db, "Users", user.id);
      await updateDoc(userRef, {
        baseRole: null,
        Permissions: [],
      });

      toast.success(`${user.Fname} ${user.Lname} is no longer an admin`);
      setIsRemoveAdminModalOpen(false);
      setSelectedUser(null);
    } catch (err) {
      console.error("Failed to remove admin:", err);
      toast.error("Failed to remove admin");
    } finally {
      setIsLoading(false);
    }
  };

  const togglePermission = (permissionKey: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(permissionKey)
        ? prev.filter((p) => p !== permissionKey)
        : [...prev, permissionKey]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (!formData["Practice ID"]) {
        toast.error("Please select a practice");
        return;
      }

      let userId: string | undefined;
      let imageUrl: string | null = formData["User Pic"];

      if (selectedUser) {
        const user = users.find((u) => u.id === selectedUser);
        if (user) {
          if (selectedImage) {
            imageUrl = await uploadImage(selectedUser);
          }
          await updateUser({
            ...user,
            ...formData,
            "User Pic": imageUrl || user["User Pic"],
            Designation: formData.Designation,
          });
          toast.success("Lawyer updated successfully");
        }
        setIsEditModalOpen(false);
      } else {
        const password = generateRandomPassword();

        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.Email,
          password
        );

        await updateProfile(userCredential.user, {
          displayName: `${formData.Fname} ${formData.Lname}`,
        });

        const authUid = userCredential.user.uid;

        const newUserId = await addUser(
          {
            ...formData,
            Designation: formData.Designation,
            Status: true,
            Role: true,
            CreatedAt: Timestamp.fromDate(new Date()),
            "Chamber ID": hospital?.id ?? "",
            "User ID": authUid,
          },
          authUid
        );

        if (typeof newUserId === "string" && newUserId) {
          userId = newUserId;
          if (selectedImage) {
            imageUrl = await uploadImage(newUserId);
          }
          const userRef = doc(db, "Users", newUserId);
          await updateDoc(userRef, {
            "User ID": newUserId,
            "User Pic": imageUrl || "",
          });

          const scheduleSubRef = doc(
            db,
            "Users",
            newUserId,
            "Schedule",
            newUserId
          );
          await setDoc(scheduleSubRef, {
            "Active Days": scheduleData["Active Days"],
            "Off Days": scheduleData["Off Days"],
            Shift: scheduleData.Shift,
            "Shift Start": scheduleData["Shift Start"],
            "Shift Switch": scheduleData["Shift Switch"],
          });

          toast.success("Lawyer added successfully");
          toast.success(`Lawyer password: ${password}`, { duration: 10000 });
        }
        setIsAddModalOpen(false);
      }
      resetForm();
    } catch (err) {
      console.error("Failed to save lawyer:", err);
      toast.error("Failed to save lawyer");

      if (formData.Email && !selectedUser) {
        try {
          await deleteUser(auth.currentUser!);
        } catch (cleanupErr) {
          console.error("Failed to clean up auth account:", cleanupErr);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle bulk import of lawyers
  const handleBulkImport = async (
    lawyers: Array<{
      Fname: string;
      Lname: string;
      Email: string;
      'Mobile Number': string;
      Title: string;
      Designation: string;
      'Practice ID': string;
      Region: string;
      'User Pic': string;
      'Active Days': number;
      'Off Days': number;
      'Shift': number;
      'Shift Start': string;
      'Shift Switch': number;
    }>
  ): Promise<{ success: number; failed: number; errors: string[] }> => {
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Store the current admin user to restore later
    const currentAdminUser = auth.currentUser;
    if (!currentAdminUser) {
      errors.push('No authenticated admin user found');
      return { success: 0, failed: lawyers.length, errors };
    }

    // Set flag to prevent logout during bulk import
    sessionStorage.setItem('bulkImportInProgress', 'true');
    sessionStorage.setItem('expectedAdminUid', currentAdminUser.uid);

    try {
      for (const lawyerData of lawyers) {
      let createdAuthUser = null;
      try {
        // Check if email already exists in users list
        const existingUser = users.find((u) => u.Email?.toLowerCase() === lawyerData.Email.toLowerCase());
        if (existingUser) {
          failedCount++;
          errors.push(`${lawyerData.Email}: Email already exists`);
          continue;
        }

        // Check if Practice ID is provided
        if (!lawyerData["Practice ID"]) {
          failedCount++;
          errors.push(`${lawyerData.Email}: Practice ID is required`);
          continue;
        }

        // Generate random password
        const password = generateRandomPassword();

        // Create auth account
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          lawyerData.Email,
          password
        );
        createdAuthUser = userCredential.user;

        await updateProfile(userCredential.user, {
          displayName: `${lawyerData.Fname} ${lawyerData.Lname}`,
        });

        const authUid = userCredential.user.uid;

        // Create user document using addUser (which creates it in Users collection)
        const newUserId = await addUser(
          {
            Fname: lawyerData.Fname,
            Lname: lawyerData.Lname,
            Email: lawyerData.Email,
            "Mobile Number": lawyerData["Mobile Number"],
            Title: lawyerData.Title,
            Designation: lawyerData.Designation,
            "Practice ID": lawyerData["Practice ID"],
            "Chamber ID": hospital?.id ?? "",
            Region: lawyerData.Region,
            Status: true,
            Role: true,
            CreatedAt: Timestamp.fromDate(new Date()),
            "User ID": authUid,
            "User Pic": lawyerData["User Pic"] || "",
          },
          authUid
        );

        if (typeof newUserId === "string" && newUserId) {
          // Update user pic if provided
          if (lawyerData["User Pic"]) {
            const userRef = doc(db, "Users", newUserId);
            await updateDoc(userRef, {
              "User Pic": lawyerData["User Pic"],
            });
          }

          // Create schedule with data from import
          const scheduleSubRef = doc(
            db,
            "Users",
            newUserId,
            "Schedule",
            newUserId
          );
          await setDoc(scheduleSubRef, {
            "Active Days": lawyerData["Active Days"] || 5,
            "Off Days": lawyerData["Off Days"] || 2,
            Shift: lawyerData["Shift"] || 1,
            "Shift Start": Timestamp.fromDate(new Date(lawyerData["Shift Start"])),
            "Shift Switch": lawyerData["Shift Switch"] || 0,
          });

          successCount++;
        } else {
          failedCount++;
          errors.push(`${lawyerData.Email}: Failed to create user document`);
          // Clean up auth account
          if (createdAuthUser) {
            try {
              await deleteUser(createdAuthUser);
            } catch (cleanupErr) {
              console.error("Failed to clean up auth account:", cleanupErr);
            }
          }
        }
      } catch (err: any) {
        failedCount++;
        let errorMessage = err.message || "Unknown error";
        
        // Handle specific Firebase Auth errors
        if (err.code === 'auth/email-already-in-use') {
          errorMessage = 'Email already exists in authentication system';
        } else if (err.code === 'auth/invalid-email') {
          errorMessage = 'Invalid email address';
        } else if (err.code === 'auth/weak-password') {
          errorMessage = 'Password is too weak';
        } else if (err.code === 'auth/network-request-failed') {
          errorMessage = 'Network error - please check your connection';
        }
        
        errors.push(`${lawyerData.Email}: ${errorMessage}`);
        console.error(`Failed to import lawyer ${lawyerData.Email}:`, err);
        
        // Clean up auth account if it was created
        if (createdAuthUser) {
          try {
            await deleteUser(createdAuthUser);
          } catch (cleanupErr) {
            console.error("Failed to clean up auth account:", cleanupErr);
          }
        }
      }
      }
    } finally {
      // Clear the bulk import flag
      sessionStorage.removeItem('bulkImportInProgress');
      sessionStorage.removeItem('expectedAdminUid');
      
      // After bulk import, if we're signed in as a different user (a newly created lawyer),
      // we need to sign out to restore the admin session. However, since we can't 
      // re-authenticate the admin without their password, the user will need to refresh the page.
      if (auth.currentUser && auth.currentUser.uid !== currentAdminUser.uid) {
        console.warn('Signed in as different user after bulk import. Signing out to restore admin session.');
        // Sign out the current user (the newly created lawyer)
        // This will trigger the auth state listener, but since we're no longer bulk importing,
        // it should handle it normally (which means staying signed out until admin signs back in)
        try {
          await signOut(auth);
          toast.error('Bulk import completed, but you were signed out. Please refresh the page and sign back in.');
        } catch (signOutErr) {
          console.error('Error signing out after bulk import:', signOutErr);
        }
      }
    }

    return { success: successCount, failed: failedCount, errors };
  };

  const updateUserSchedule = async (userId: string, scheduleData: any) => {
    setIsLoading(true);
    try {
      const scheduleCollectionRef = collection(db, "Users", userId, "Schedule");
      const q = query(scheduleCollectionRef);
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        await addDoc(scheduleCollectionRef, scheduleData);
      } else {
        const scheduleDocRef = doc(db, "Users", userId, "Schedule", userId);
        await setDoc(scheduleDocRef, scheduleData);
      }
      toast.success("Schedule updated successfully");
    } catch (err) {
      console.error("Failed to update schedule:", err);
      toast.error("Failed to update schedule");
    } finally {
      setIsLoading(false);
    }
  };

  const handleScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = users.find((u) => u.id === selectedUser);
    if (!user) return;

    await updateUserSchedule(user.id, {
      "Active Days": scheduleData["Active Days"],
      "Off Days": scheduleData["Off Days"],
      Shift: scheduleData.Shift,
      "Shift Start": scheduleData["Shift Start"],
      "Shift Switch": scheduleData["Shift Switch"],
    });

    setIsScheduleModalOpen(false);
    resetSchedule();
  };

  const resetForm = () => {
    setFormData({
      Fname: "",
      Lname: "",
      Email: "",
      "Mobile Number": "",
      "Chamber ID": hospital?.id ?? "",
      Title: "",
      Designation: "",
      "Practice ID": departments[0]?.["Practice ID"] || departments[0]?.["Department ID"] || departments[0]?.id || "",
      Role: true,
      Status: true,
      Region: "",
      "User Pic": "",
      Experience: 1,
    });
    setFormStep(1);
    setSelectedImage(null);
    setImagePreview(null);
  };

  const resetSchedule = () => {
    setScheduleData({
      "Active Days": 0,
      "Off Days": 0,
      Shift: 0,
      "Shift Start": Timestamp.fromDate(new Date()),
      "Shift Switch": 0,
    });
  };

  const ScheduleForm = () => (
    <form onSubmit={handleScheduleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          type="number"
          label="Active Days"
          value={scheduleData["Active Days"]}
          onChange={(e) =>
            setScheduleData({
              ...scheduleData,
              "Active Days": Number(e.target.value),
            })
          }
          min="0"
          required
          className="bg-gray-50 border-gray-200 text-gray-900"
        />
        <Input
          type="number"
          label="Off Days"
          value={scheduleData["Off Days"]}
          onChange={(e) =>
            setScheduleData({
              ...scheduleData,
              "Off Days": Number(e.target.value),
            })
          }
          min="0"
          required
          className="bg-gray-50 border-gray-200 text-gray-900"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input
          type="number"
          label="Number of Shifts"
          value={scheduleData.Shift}
          onChange={(e) =>
            setScheduleData({ ...scheduleData, Shift: Number(e.target.value) })
          }
          max="3"
          required
          className="bg-gray-50 border-gray-200 text-gray-900"
        />
        <Input
          type="number"
          label="Shift Switch Frequency"
          value={scheduleData["Shift Switch"]}
          onChange={(e) =>
            setScheduleData({
              ...scheduleData,
              "Shift Switch": Number(e.target.value),
            })
          }
          min="0"
          required
          className="bg-gray-50 border-gray-200 text-gray-900"
        />
      </div>
      <Input
        label="Shift Start Date"
        type="date"
        value={scheduleData["Shift Start"].toDate().toISOString().split("T")[0]}
        onChange={(e) =>
          setScheduleData({
            ...scheduleData,
            "Shift Start": Timestamp.fromDate(new Date(e.target.value)),
          })
        }
        required
        className="bg-gray-50 border-gray-200 text-gray-900"
      />
      <Button
        type="submit"
        fullWidth
        disabled={isLoading}
        className="bg-gray-800 hover:bg-gray-900 text-white"
      >
        {isLoading ? "Saving..." : "Save Schedule"}
      </Button>
    </form>
  );

  return (
    <Layout>
      <div className="space-y-6 bg-gray-50 p-6 rounded-lg">
        {/* Header */}
        {isPageLoading ? (
          <HeaderSkeleton />
        ) : (
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Lawyers</h1>
              <p className="mt-2 text-base text-gray-700">
                Manage your chamber's lawyers and their schedules
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setIsBulkUploadModalOpen(true);
                }}
                variant="outline"
                className="flex items-center border-gray-700 text-gray-600 hover:bg-gray-50"
              >
                <Upload className="w-5 h-5 mr-2" />
                Bulk Upload
              </Button>
              <Button
                onClick={() => {
                  setIsAddModalOpen(true);
                  resetForm();
                }}
                className="flex items-center bg-gray-800 hover:bg-gray-900 text-white"
              >
                <Plus className="w-5 h-5 mr-2" />
                Add Lawyer
              </Button>
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="sticky top-0 z-10 bg-gray-50 py-4">
          {isPageLoading ? (
            <SearchSkeleton />
          ) : (
            <Input
              placeholder="Search by name or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md bg-gray-100 border-gray-200 text-gray-900 placeholder-gray-500"
            />
          )}
        </div>

        {/* Empty State */}
        {!isPageLoading && filteredUsers.length === 0 && (
          <div className="text-center py-10">
            <p className="text-gray-600 text-lg">
              {searchTerm
                ? "No lawyers found matching your search."
                : "No lawyers available."}
            </p>
          </div>
        )}

        {/* Lawyer Cards */}
        {isPageLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <LawyerCardSkeleton key={index} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             {paginatedUsers.map((user) => (
              <div
                key={user.id}
                className={`bg-gray-100 p-6 rounded-lg shadow-md border-2 ${
                  user.Status ? "border-gray-200" : "border-red-400"
                } hover:bg-gray-100 transition-all duration-200`}
              >
                <div className="flex items-center space-x-4">
                  {user["User Pic"] ? (
                    <img
                      src={user["User Pic"].toString()}
                      alt={`${user.Fname} ${user.Lname}`}
                      className="h-12 w-12 rounded-full object-cover shadow-md"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-gradient-to-r from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold shadow-md">
                      {user.Fname.charAt(0)}
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {user.Title} {user.Fname} {user.Lname}
                    </h3>
                    <p className="text-sm text-gray-700">
                      {departments.find(
                        (d) => d.id === user["Practice ID"] || d["Practice ID"] === user["Practice ID"] || d.id === user["Department ID"]
                      )?.["Practice Name"] || departments.find(
                        (d) => d.id === user["Department ID"]
                      )?.["Department Name"] || "N/A"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-gray-800">
                    Designation: {user.Designation}
                  </p>
                  <p className="text-sm text-gray-800">
                    Status: {user.Status ? "Active" : "Disabled"}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        setSelectedUser(user.id);
                        setIsScheduleModalOpen(true);
                        await loadScheduleData(user.id); // Load data when modal opens
                      }}
                      className="border-gray-200 text-gray-700 hover:bg-gray-300"
                      disabled={isLoading}
                    >
                      <Calendar className="w-4 h-4 mr-1" />
                      Schedule
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user.id);
                        setFormData({
                          Fname: user.Fname,
                          Lname: user.Lname,
                          Email: user.Email,
                          "Mobile Number": user["Mobile Number"],
                          "Chamber ID": hospital?.id ?? "",
                          Title: user.Title,
                          Designation: user.Designation,
                          "Practice ID": user["Practice ID"] || user["Department ID"],
                          Role: user.Role,
                          Status: user.Status,
                          Region: user.Region,
                          "User Pic": user["User Pic"]
                            ? String(user["User Pic"])
                            : "",
                          Experience: (user as any).Experience || 1,
                        });
                        setImagePreview(
                          user["User Pic"] ? String(user["User Pic"]) : null
                        );
                        setIsEditModalOpen(true);
                      }}
                      className="border-gray-200 text-gray-700 hover:bg-gray-300"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisableEnable(user.id, !user.Status)}
                      className={`border-gray-200 ${
                        user.Status ? "text-red-600" : "text-green-600"
                      } hover:bg-gray-300`}
                      disabled={isLoading}
                    >
                      {user.Status ? (
                        <>
                          <UserX className="w-4 h-4 mr-1" />
                          Disable
                        </>
                      ) : (
                        <>
                          <UserCheck className="w-4 h-4 mr-1" />
                          Enable
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedUser(user.id);
                        setNewPassword(generateRandomPassword());
                        setIsResetPasswordModalOpen(true);
                      }}
                      className="border-gray-200 text-gray-700 hover:bg-gray-300"
                      disabled={isLoading}
                    >
                      <Lock className="w-4 h-4 mr-1" />
                      Reset Password
                    </Button>
                    {/* Only show Make Admin button for users who are not admins */}
                    {(user as any).baseRole !== "hospital_manager" &&
                      (user as any).baseRole !== "hospital_admin" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user.id);
                            setSelectedPermissions([]);
                            setIsMakeAdminModalOpen(true);
                          }}
                          className="border-gray-200 text-gray-700 hover:bg-gray-300"
                          disabled={isLoading}
                        >
                          <Shield className="w-4 h-4 mr-1" />
                          Make Admin
                        </Button>
                      )}
                    {/* Only show Remove Admin button for hospital_manager, NOT for hospital_admin */}
                    {(user as any).baseRole === "hospital_manager" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUser(user.id);
                            setIsRemoveAdminModalOpen(true);
                          }}
                          className="border-red-200 text-red-600 hover:bg-red-100"
                          disabled={isLoading}
                        >
                          <ShieldOff className="w-4 h-4 mr-1" />
                          Remove Admin
                        </Button>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

                {filteredUsers.length > itemsPerPage && (
                  <div className="flex justify-between items-center mt-4 px-4 pb-4 no-print">
                    <p className="text-sm text-white">
                      Page {currentPage} of {totalPages}
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 rounded-lg bg-gray-500 text-gray-900 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </Button>
                      {getPageNumbers().map(page => (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-5 py-1.5 rounded-xl ${currentPage === page ? 'bg-gradient-to-r from-gray-700 to-gray-900 text-white shadow-lg' : 'bg-gray-400 text-gray-100 hover:bg-gray-600'}`}
                        >
                          {page}
                        </button>
                      ))}
                      <Button
                        onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 rounded-lg bg-gray-500 text-gray-900 hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}

        {/* Add Lawyer Modal */}
        <Modal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            resetForm();
          }}
          title={formStep === 1 ? "Add Lawyer Details" : "Set Schedule"}
          size="lg"
        >
          {isPageLoading ? (
            formStep === 1 ? (
              <FormSkeleton />
            ) : (
              <ScheduleFormSkeleton />
            )
          ) : (
            <div className="space-y-6">
              {formStep === 1 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setFormStep(2);
                  }}
                  className="space-y-6"
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      value={formData.Fname}
                      onChange={(e) =>
                        setFormData({ ...formData, Fname: e.target.value })
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                    <Input
                      label="Last Name"
                      value={formData.Lname}
                      onChange={(e) =>
                        setFormData({ ...formData, Lname: e.target.value })
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Input
                      label="Email"
                      type="email"
                      value={formData.Email}
                      onChange={(e) =>
                        setFormData({ ...formData, Email: e.target.value })
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                    <Input
                      label="Mobile Number"
                      type="tel"
                      value={formData["Mobile Number"]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          "Mobile Number": e.target.value,
                        })
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Profile Picture
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif"
                        onChange={handleImageChange}
                        className="block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                      />
                      {imagePreview && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={removeImage}
                          className="border-gray-200 text-red-600 hover:bg-gray-300"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {imagePreview && (
                      <div className="mt-4">
                        <img
                          src={imagePreview}
                          alt="Profile preview"
                          className="h-24 w-24 rounded-full object-cover shadow-md"
                        />
                      </div>
                    )}
                  </div>
                  <Input
                    label="Profile Picture URL (Optional)"
                    value={formData["User Pic"]}
                    onChange={(e) =>
                      setFormData({ ...formData, "User Pic": e.target.value })
                    }
                    className="bg-gray-50 border-gray-200 text-gray-900"
                    placeholder="Enter URL if not uploading an image"
                  />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label="Title"
                      value={formData.Title}
                      onChange={(value) =>
                        setFormData({ ...formData, Title: value })
                      }
                      options={Title.map((title) => ({
                        value: title,
                        label: title,
                      }))}
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                    <Input
                      label="Designation"
                      type="text"
                      value={formData.Designation}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          Designation: e.target.value,
                        })
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Select
                      label="Practice"
                      value={formData["Practice ID"]}
                      onChange={(value) => {
                        console.log("Practice selected:", value);
                        setFormData({ ...formData, "Practice ID": value });
                      }}
                      options={
                        departments.length > 0
                          ? departments.map((dept) => ({
                              value: dept["Practice ID"] || dept["Department ID"] || dept.id,
                              label: dept["Practice Name"] || dept["Department Name"] || "Unnamed Practice",
                            }))
                          : [{ value: "", label: "No practices available" }]
                      }
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                      disabled={departments.length === 0}
                    />
                    <Select
                      label="Region"
                      value={formData.Region}
                      onChange={(value) =>
                        setFormData({ ...formData, Region: value })
                      }
                      options={Region.map((region) => ({
                        value: region,
                        label: region,
                      }))}
                      required
                      className="bg-gray-50 border-gray-200 text-gray-900"
                    />
                  </div>
                  {departments.length === 0 && (
                    <p className="text-sm text-red-600">
                      No practices available. Please add practices first.
                    </p>
                  )}
                  <Button
                    type="submit"
                    fullWidth
                    className="bg-gray-800 hover:bg-gray-900 text-white"
                    disabled={departments.length === 0 || isLoading}
                  >
                    Next: Schedule
                  </Button>
                </form>
              )}
              {formStep === 2 && (
                <div className="space-y-6">
                  <ScheduleForm />
                  <div className="flex justify-between">
                    <Button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="bg-gray-200 text-gray-900 hover:bg-gray-300"
                    >
                      Back
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      className="bg-gray-800 hover:bg-gray-900 text-white"
                      disabled={isLoading}
                    >
                      {isLoading ? "Adding..." : "Add Lawyer"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>

        {/* Edit Lawyer Modal */}
        <Modal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setSelectedUser(null);
            resetForm();
          }}
          title="Edit Lawyer"
          size="lg"
        >
          {isPageLoading ? (
            <FormSkeleton />
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  value={formData.Fname}
                  onChange={(e) =>
                    setFormData({ ...formData, Fname: e.target.value })
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
                <Input
                  label="Last Name"
                  value={formData.Lname}
                  onChange={(e) =>
                    setFormData({ ...formData, Lname: e.target.value })
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Email"
                  type="email"
                  value={formData.Email}
                  onChange={(e) =>
                    setFormData({ ...formData, Email: e.target.value })
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
                <Input
                  label="Mobile Number"
                  type="tel"
                  value={formData["Mobile Number"]}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      "Mobile Number": e.target.value,
                    })
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Profile Picture
                </label>
                <div className="flex items-center space-x-4">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif"
                    onChange={handleImageChange}
                    className="block w-full text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
                  />
                  {imagePreview && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={removeImage}
                      className="border-gray-200 text-red-600 hover:bg-gray-300"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
                {imagePreview && (
                  <div className="mt-4">
                    <img
                      src={imagePreview}
                      alt="Profile preview"
                      className="h-24 w-24 rounded-full object-cover shadow-md"
                    />
                  </div>
                )}
              </div>
              <Input
                label="Profile Picture URL (Optional)"
                value={formData["User Pic"]}
                onChange={(e) =>
                  setFormData({ ...formData, "User Pic": e.target.value })
                }
                className="bg-gray-50 border-gray-200 text-gray-900"
                placeholder="Enter URL if not uploading an image"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Title"
                  value={formData.Title}
                  onChange={(value) =>
                    setFormData({ ...formData, Title: value })
                  }
                  options={Title.map((title) => ({
                    value: title,
                    label: title,
                  }))}
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
                <Input
                  label="Designation"
                  type="text"
                  value={formData.Designation}
                  onChange={(e) =>
                    setFormData({ ...formData, Designation: e.target.value })
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  label="Practice"
                  value={formData["Practice ID"]}
                  onChange={(value) => {
                    console.log("Practice selected:", value);
                    setFormData({ ...formData, "Practice ID": value });
                  }}
                  options={
                    departments.length > 0
                      ? departments.map((dept) => ({
                          value: dept["Practice ID"] || dept["Department ID"] || dept.id,
                          label: dept["Practice Name"] || dept["Department Name"] || "Unnamed Practice",
                        }))
                      : [{ value: "", label: "No practices available" }]
                  }
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                  disabled={departments.length === 0}
                />
                <Select
                  label="Region"
                  value={formData.Region}
                  onChange={(value) =>
                    setFormData({ ...formData, Region: value })
                  }
                  options={Region.map((region) => ({
                    value: region,
                    label: region,
                  }))}
                  required
                  className="bg-gray-50 border-gray-200 text-gray-900"
                />
              </div>
              {departments.length === 0 && (
                <p className="text-sm text-red-600">
                  No practices available. Please add practices first.
                </p>
              )}
              <Button
                type="submit"
                fullWidth
                className="bg-gray-800 hover:bg-gray-900 text-white"
                disabled={isLoading || departments.length === 0}
              >
                {isLoading ? "Updating..." : "Update Lawyer"}
              </Button>
            </form>
          )}
        </Modal>

        {/* Schedule Modal */}
        <Modal
          isOpen={isScheduleModalOpen}
          onClose={() => {
            setIsScheduleModalOpen(false);
            setSelectedUser(null);
            resetSchedule();
          }}
          title="Manage Schedule"
          size="lg"
        >
          {isPageLoading ? <ScheduleFormSkeleton /> : <ScheduleForm />}
        </Modal>

        {/* Reset Password Modal */}
        <Modal
          isOpen={isResetPasswordModalOpen}
          onClose={() => {
            setIsResetPasswordModalOpen(false);
            setSelectedUser(null);
            setNewPassword("");
          }}
          title="Reset Lawyer Password"
          size="md"
        >
          <form onSubmit={handleResetPassword} className="space-y-6">
            <div>
              <p className="text-gray-700">
                New password for{" "}
                {users.find((u) => u.id === selectedUser)?.Fname}{" "}
                {users.find((u) => u.id === selectedUser)?.Lname}:
              </p>
              <Input
                label="New Password"
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                className="bg-gray-50 border-gray-200 text-gray-900"
              />
            </div>
            <Button
              type="submit"
              fullWidth
              className="bg-gray-800 hover:bg-gray-900 text-white"
              disabled={isLoading}
            >
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </Modal>

        {/* Make Admin Modal */}
        <Modal
          isOpen={isMakeAdminModalOpen}
          onClose={() => {
            setIsMakeAdminModalOpen(false);
            setSelectedUser(null);
            setSelectedPermissions([]);
          }}
          title="Make Admin"
          size="lg"
        >
          <form onSubmit={handleMakeAdmin} className="space-y-6">
            <div>
              <p className="text-gray-700 mb-4">
                Select permissions for{" "}
                <span className="font-semibold">
                  {users.find((u) => u.id === selectedUser)?.Fname}{" "}
                  {users.find((u) => u.id === selectedUser)?.Lname}
                </span>
                . This will grant them admin access with the selected permissions.
              </p>
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-900 mb-2">
                  Permissions
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {availablePermissions.map((permission) => (
                    <label
                      key={permission.key}
                      className="flex items-center space-x-3 p-3 rounded-lg border-2 border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(permission.key)}
                        onChange={() => togglePermission(permission.key)}
                        className="w-4 h-4 text-gray-600 border-gray-300 rounded focus:ring-gray-700"
                      />
                      <span className="text-sm text-gray-900">
                        {permission.label}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedPermissions.length === 0 && (
                  <p className="text-sm text-red-600 mt-2">
                    Please select at least one permission
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsMakeAdminModalOpen(false);
                  setSelectedUser(null);
                  setSelectedPermissions([]);
                }}
                className="border-gray-200 text-gray-700 hover:bg-gray-100"
                disabled={isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gray-800 hover:bg-gray-900 text-white"
                disabled={isLoading || selectedPermissions.length === 0}
              >
                {isLoading ? "Granting..." : "Make Admin"}
              </Button>
            </div>
          </form>
        </Modal>

        {/* Remove Admin Modal */}
        <Modal
          isOpen={isRemoveAdminModalOpen}
          onClose={() => {
            setIsRemoveAdminModalOpen(false);
            setSelectedUser(null);
          }}
          title="Remove Admin"
          size="md"
        >
          <div className="space-y-6">
            {users.find((u) => u.id === selectedUser) &&
            (users.find((u) => u.id === selectedUser) as any).baseRole ===
              "hospital_admin" ? (
              <div className="space-y-4">
                <p className="text-red-700 font-semibold">
                  Cannot Remove Admin Status
                </p>
                <p className="text-gray-700">
                  Users with <span className="font-semibold">hospital_admin</span> role
                  cannot have their admin status removed or permissions modified. This is a
                  protected role.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    setIsRemoveAdminModalOpen(false);
                    setSelectedUser(null);
                  }}
                  className="w-full bg-gray-800 hover:bg-gray-900 text-white"
                >
                  Close
                </Button>
              </div>
            ) : (
              <>
                <p className="text-gray-700">
                  Are you sure you want to remove admin access from{" "}
                  <span className="font-semibold">
                    {users.find((u) => u.id === selectedUser)?.Fname}{" "}
                    {users.find((u) => u.id === selectedUser)?.Lname}
                  </span>
                  ? This will revoke their admin privileges and permissions.
                </p>
                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsRemoveAdminModalOpen(false);
                      setSelectedUser(null);
                    }}
                    className="border-gray-200 text-gray-700 hover:bg-gray-100"
                    disabled={isLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleRemoveAdmin}
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={isLoading}
                  >
                    {isLoading ? "Removing..." : "Remove Admin"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Modal>

        {/* Bulk Upload Modal */}
        <BulkUploadModal
          isOpen={isBulkUploadModalOpen}
          onClose={() => setIsBulkUploadModalOpen(false)}
          onImport={handleBulkImport}
          departments={departments}
          Title={Title}
          Region={Region}
          existingUsers={users}
        />
      </div>
    </Layout>
  );
};

export default LawyersPage;
