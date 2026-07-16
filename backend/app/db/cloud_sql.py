from contextlib import asynccontextmanager

from google.cloud.sql.connector import Connector


class CloudSqlDatabase:
    """Passwordless Cloud SQL connections using the Cloud Run service identity."""

    def __init__(self, instance: str, database: str, iam_user: str) -> None:
        self.instance = instance
        self.database = database
        self.iam_user = iam_user
        self.connector = Connector(refresh_strategy="LAZY")

    @asynccontextmanager
    async def connection(self):
        connection = await self.connector.connect_async(
            self.instance,
            "asyncpg",
            user=self.iam_user,
            db=self.database,
            enable_iam_auth=True,
        )
        try:
            yield connection
        finally:
            await connection.close()

    async def close(self) -> None:
        await self.connector.close_async()
