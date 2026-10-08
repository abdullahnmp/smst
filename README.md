# Smart Reminder

Expo (React Native) app. Notes with headline and optional description, scheduled reminders or alarms,
and serial interval notifications from your saved notes. Data is stored locally on the device.

## Build an APK without installing anything
1. Upload all files in this folder to a GitHub repository.
2. On expo.dev create a project and connect that repository.
3. Copy the project ID into app.json: "extra": { "eas": { "projectId": "YOUR-ID" } }
4. Change android.package in app.json to something unique, such as com.yourname.smartreminder.
5. In Expo, start a build: Platform Android, Profile preview. Download the APK when it finishes.
