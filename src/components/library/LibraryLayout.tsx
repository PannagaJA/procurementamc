import React from "react";
import LibraryNavbar from "./LibraryNavbar";
import Layout from "@/components/Layout";

const LibraryLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <Layout extraHeader={<LibraryNavbar />} hideGlobalNav={true}>
      <div className="container mx-auto px-6 py-6">
        <div className="bg-card rounded-lg shadow-sm p-4">{children}</div>
      </div>
    </Layout>
  );
};

export default LibraryLayout;
