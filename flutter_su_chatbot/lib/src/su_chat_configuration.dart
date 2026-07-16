import 'dart:async';

typedef AccessTokenProvider = FutureOr<String> Function();

/// Configuration supplied by the host Strathmore application.
class SuChatConfiguration {
  const SuChatConfiguration({
    required this.apiBaseUri,
    required this.accessTokenProvider,
    this.initialSessionId,
    this.onSessionChanged,
    this.welcomeMessage =
        'Hello! I can help you find approved information about courses, fees, '
        'academic processes, and student services. How can I help?',
  });

  final Uri apiBaseUri;
  final AccessTokenProvider accessTokenProvider;
  final String? initialSessionId;
  final ValueChanged<String>? onSessionChanged;
  final String welcomeMessage;
}

typedef ValueChanged<T> = void Function(T value);
