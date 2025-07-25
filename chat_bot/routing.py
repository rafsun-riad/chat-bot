from django.urls import path

from chat_bot.consumers import ChatConsumer

websocket_urlpatterns = [path("chat/", ChatConsumer.as_asgi())]
