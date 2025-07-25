from _typeshed import Incomplete

from ..rfc6749 import AuthorizationServer, ClientMixin
from ..rfc6749.requests import OAuth2Request

class JWTAuthenticationRequest:
    support_request: bool
    support_request_uri: bool
    def __init__(self, support_request: bool = True, support_request_uri: bool = True) -> None: ...
    def __call__(self, authorization_server: AuthorizationServer) -> None: ...
    def parse_authorization_request(self, authorization_server: AuthorizationServer, request: OAuth2Request) -> None: ...
    def get_request_object(self, request_uri: str): ...
    def resolve_client_public_keys(self, client: ClientMixin): ...
    def get_server_metadata(self) -> dict[str, Incomplete]: ...
    def get_client_require_signed_request_object(self, client: ClientMixin) -> bool: ...
