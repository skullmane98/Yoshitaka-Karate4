import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import ProtectedRoute from "@/components/ProtectedRoute";

import Home from "@/pages/Home";
import About from "@/pages/About";
import Programs from "@/pages/Programs";
import Schedule from "@/pages/Schedule";
import News from "@/pages/News";
import Contact from "@/pages/Contact";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import StudentDashboard from "@/pages/dashboard/StudentDashboard";
import AdminDashboard from "@/pages/dashboard/AdminDashboard";
import SuperAdminDashboard from "@/pages/dashboard/SuperAdminDashboard";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
      <AuthProvider>
        <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: "var(--dojo-paper)",
              border: "1px solid var(--dojo-border)",
              color: "var(--dojo-ink)",
              borderRadius: "2px",
              fontFamily: "Outfit, sans-serif",
            },
          }}
        />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/programs" element={<Programs />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/news" element={<News />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route
            path="/dashboard/student"
            element={
              <ProtectedRoute roles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/super-admin"
            element={
              <ProtectedRoute roles={["super_admin"]}>
                <SuperAdminDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
