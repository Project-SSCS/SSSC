import { NextResponse } from "next/server";
import { getMongoClient } from "@/lib/mongodb";

type MessageDocument = {
  name: string;
  body: string;
  createdAt: Date;
};

const databaseName = process.env.MONGODB_DB ?? "nextapp";
const collectionName = "messages";

export async function GET() {
  const client = await getMongoClient();
  const messages = await client
    .db(databaseName)
    .collection<MessageDocument>(collectionName)
    .find({})
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();

  return NextResponse.json({
    messages: messages.map((message) => ({
      id: message._id.toString(),
      name: message.name,
      body: message.body,
      createdAt: message.createdAt.toISOString()
    }))
  });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  const body = typeof payload?.body === "string" ? payload.body.trim() : "";

  if (!name || !body) {
    return NextResponse.json(
      { error: "Both name and message are required." },
      { status: 400 }
    );
  }

  const client = await getMongoClient();
  const message: MessageDocument = {
    name: name.slice(0, 80),
    body: body.slice(0, 500),
    createdAt: new Date()
  };

  const result = await client
    .db(databaseName)
    .collection<MessageDocument>(collectionName)
    .insertOne(message);

  return NextResponse.json(
    {
      message: {
        id: result.insertedId.toString(),
        ...message,
        createdAt: message.createdAt.toISOString()
      }
    },
    { status: 201 }
  );
}
