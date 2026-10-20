import { redirect } from 'next/navigation';

// Factor assignments now live on each user in /users.
export default function UserFactorsPage() {
  redirect('/users');
}
