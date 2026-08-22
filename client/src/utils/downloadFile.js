const downloadFile = async (documentId, fileName) => {
  try {
    const token = localStorage.getItem('accessToken');
    const url   = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/documents/${documentId}/download`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = fileName || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Download error:', err);
    alert('Download failed. Please try again.');
  }
};

export const downloadTemplate = async (documentType, fileName) => {
  try {
    const token = localStorage.getItem('accessToken');
    const url   = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/documents/template/${documentType}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = fileName || 'template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Template download error:', err);
    alert('Could not download template. Please try again.');
  }
};

export const downloadStudentsActivityTemplate = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    const url   = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/schools/students-activity/template`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = 'Students_Activity_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Template download error:', err);
    alert('Could not download template. Please try again.');
  }
};

export const downloadTeachersActivityTemplate = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    const url   = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/schools/teachers-activity/template`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = 'Teachers_Activity_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Template download error:', err);
    alert('Could not download template. Please try again.');
  }
};

export const downloadSchoolsBulkTemplate = async () => {
  try {
    const token = localStorage.getItem('accessToken');
    const url   = `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/schools/bulk-template`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`Download failed: ${res.status}`);

    const blob    = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = blobUrl;
    a.download    = 'Schools_Bulk_Template.xlsx';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch (err) {
    console.error('Template download error:', err);
    alert('Could not download template. Please try again.');
  }
};

export default downloadFile;
