# SU Chatbot Flutter package

Add this directory as a path or Git dependency, then override the configuration at
the host application's authenticated boundary:

```dart
ProviderScope(
  overrides: [
    suChatConfigurationProvider.overrideWithValue(
      SuChatConfiguration(
        apiBaseUri: Uri.parse('https://assistant.strathmore.edu'),
        accessTokenProvider: authRepository.getAssistantAccessToken,
        initialSessionId: preferences.getString('su_chat_session'),
        onSessionChanged: (id) => preferences.setString('su_chat_session', id),
      ),
    ),
  ],
  child: const MaterialApp(home: SuChatPage()),
)
```

For speech input, add `RECORD_AUDIO` to Android and
`NSSpeechRecognitionUsageDescription`/`NSMicrophoneUsageDescription` to iOS. The
host app remains responsible for institutional sign-in and secure token storage.
