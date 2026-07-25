import { syncDeadlineNotificationsForAllUsers } from '../services/notification-query.service';

const run = async () => {
  await syncDeadlineNotificationsForAllUsers();
  console.log('Notification deadline sync completed');
};

run().catch((error) => {
  console.error('Notification deadline sync failed', error);
  process.exitCode = 1;
});
