import 'dart:convert';

import 'package:http/http.dart' as http;

import '../domain/chat_models.dart';
import '../su_chat_configuration.dart';

class ChatApiException implements Exception {
  const ChatApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class ChatApi {
  ChatApi(this.configuration, {http.Client? client})
    : _client = client ?? http.Client();

  final SuChatConfiguration configuration;
  final http.Client _client;

  Future<Map<String, String>> _headers() async => {
    'Authorization': 'Bearer ${await configuration.accessTokenProvider()}',
    'Content-Type': 'application/json',
  };

  Uri _uri(String path) => configuration.apiBaseUri.resolve(path);

  Future<(String, List<ChatMessage>)> openSession(String? sessionId) async {
    if (sessionId != null) {
      final response = await _client.get(
        _uri('/v1/sessions/$sessionId'),
        headers: await _headers(),
      );
      if (response.statusCode == 200) {
        final json = jsonDecode(response.body) as Map<String, dynamic>;
        return (json['id'] as String, _messages(json));
      }
      if (response.statusCode != 404) _throw(response);
    }
    final response = await _client.post(
      _uri('/v1/sessions'),
      headers: await _headers(),
      body: jsonEncode(<String, dynamic>{}),
    );
    if (response.statusCode != 201) _throw(response);
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return (json['id'] as String, _messages(json));
  }

  Future<ChatMessage> send(String sessionId, String content) async {
    final response = await _client.post(
      _uri('/v1/sessions/$sessionId/messages'),
      headers: await _headers(),
      body: jsonEncode({'content': content}),
    );
    if (response.statusCode != 200) _throw(response);
    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return ChatMessage.fromJson(json['message'] as Map<String, dynamic>);
  }

  List<ChatMessage> _messages(Map<String, dynamic> json) =>
      (json['messages'] as List<dynamic>? ?? const [])
          .map((item) => ChatMessage.fromJson(item as Map<String, dynamic>))
          .toList(growable: false);

  Never _throw(http.Response response) {
    var message = 'The assistant is temporarily unavailable.';
    try {
      message =
          (jsonDecode(response.body) as Map<String, dynamic>)['detail']
              as String? ??
          message;
    } catch (_) {}
    throw ChatApiException(message);
  }
}
