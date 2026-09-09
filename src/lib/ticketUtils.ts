import { Database } from '@/integrations/supabase/types';

export type TicketStatus = Database['public']['Enums']['ticket_status'];
export type TicketPriority = Database['public']['Enums']['ticket_priority'];

export const ticketStatusOptions: { value: TicketStatus; label: string; color: string }[] = [
  { value: 'pending', label: 'Pending', color: 'yellow' },
  { value: 'in-progress', label: 'In Progress', color: 'blue' },
  { value: 'waiting-for-user', label: 'Waiting for User', color: 'orange' },
  { value: 'resolved', label: 'Resolved', color: 'green' },
  { value: 'completed', label: 'Completed', color: 'purple' },
  { value: 'procure-in-progress', label: 'Procure In Progress', color: 'blue' },
  { value: 'procure-completed', label: 'Procure Completed', color: 'purple' },
  { value: 'procure-approved', label: 'Procure Approved', color: 'green' },
  { value: 'procure-rejected', label: 'Procure Rejected', color: 'red' },
  { value: 'service-approved', label: 'Service Approved', color: 'green' },
  { value: 'service-rejected', label: 'Service Rejected', color: 'red' },
];

export const ticketPriorityOptions: { value: TicketPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Low', color: 'green' },
  { value: 'medium', label: 'Medium', color: 'yellow' },
  { value: 'high', label: 'High', color: 'red' },
];

export const getCategoryOptions = () => [
  { value: 'inventory', label: 'Inventory' },
  { value: 'hardware', label: 'Hardware' },
  { value: 'software', label: 'Software' },
  { value: 'other', label: 'Other' },
];

export const getStatusColor = (status: string) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800';
    case 'in-progress':
      return 'bg-blue-100 text-blue-800';
    case 'waiting-for-user':
      return 'bg-orange-100 text-orange-800';
    case 'resolved':
      return 'bg-green-100 text-green-800';
    case 'completed':
      return 'bg-purple-100 text-purple-800';
    case 'procure-in-progress':
      return 'bg-blue-100 text-blue-800';
    case 'procure-completed':
      return 'bg-purple-100 text-purple-800';
    case 'procure-approved':
      return 'bg-green-100 text-green-800';
    case 'procure-rejected':
      return 'bg-red-100 text-red-800';
    case 'service-approved':
      return 'bg-emerald-100 text-emerald-800';
    case 'service-rejected':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};

export const getPriorityColor = (priority: string) => {
  switch (priority) {
    case 'low':
      return 'bg-green-100 text-green-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'high':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};