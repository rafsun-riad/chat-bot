from channels.routing import URLRouter
from django.urls import path

from chat_bot.routing import websocket_urlpatterns as chat_bot_websocket_urlpatterns

websocket_urlpatterns = [
    path("ws/", URLRouter(chat_bot_websocket_urlpatterns)),
]
