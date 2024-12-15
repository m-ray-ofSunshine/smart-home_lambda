import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
    DynamoDBDocumentClient,
    ScanCommand,
    PutCommand,
    GetCommand,
    DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { randomUUID } from 'crypto';

const client = new DynamoDBClient({});

const dynamo = DynamoDBDocumentClient.from(client);

let tableName;

const defaultHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,DELETE'
};

export const handler = async (event) => {
    console.log(event)

    if (event.request) {
        return await handleAlexaRequest(event)
    } else {
        return await handleApiRequest(event)
    }

};

// Event handling
const handleAlexaRequest = async (event) => {
    let intent = event.request.intent.name
    
    switch (intent) {
        case 'AddItemIntent':
           return await handleAddItemIntent(event.request.intent.slots.ItemName.value)
        case 'RemoveItemIntent':
            return await handleRemoveItemIntent(event.request.intent.slots.ItemName.value)
        case 'AddNoteIntent':
            return await handleAddNoteIntent(event.request.intent.slots.Note.value)
        case 'RemoveNoteIntent':
            return await handleRemoveNoteIntent(event.request.intent.slots.NoteIdentifier.value)
        default:
            return {
                statusCode: 405,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: 'Method not allowed' }),
            };
    }

}

const handleApiRequest = async (event) => {
    switch (event.resource) {
        case '/list':
            return await handleListRequest(event)
        case '/notes':
            return await handleNotesRequest(event)
    
        default:
            break;
    }


}

// API handling
const handleNotesRequest = async (event) => {
    tableName = "notes_db"
    const method = event.requestContext.httpMethod;
    const body = event.body ? JSON.parse(event.body) : null;
    const id = event.queryStringParameters ? event.queryStringParameters.id : null;
    switch (method) {
        case 'OPTIONS':
            return {
                statusCode: 200,
                defaultHeaders,
                body: JSON.stringify({ message: 'CORS preflight' })
            };
        case 'GET':
            return await getAllRecords(id, defaultHeaders, tableName );
        case 'POST':
            return await createRecord(body.name, tableName);
        case 'DELETE':
            return await deleteRecord(id, tableName);
        default:
            return {
                statusCode: 405,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: 'Method not allowed' }),
            };
    }
}

const handleListRequest = async (event) => {
    tableName = "todo_list_db"
    const method = event.requestContext.httpMethod;
    const body = event.body ? JSON.parse(event.body) : null;
    const id = event.queryStringParameters ? event.queryStringParameters.id : null;
    switch (method) {
        case 'OPTIONS':
            return {
                statusCode: 200,
                defaultHeaders,
                body: JSON.stringify({ message: 'CORS preflight' })
            };
        case 'GET':
            return await getAllRecords(id, defaultHeaders, tableName);
        case 'POST':
            return await createRecord(body.name, tableName);
        case 'DELETE':
            return await deleteRecord(id, tableName);
        default:
            return {
                statusCode: 405,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: 'Method not allowed' }),
            };
    }
}

// Intent handling

const handleAddItemIntent = async (item) => {
    let result = await createRecord(item)

    if (result.statusCode == 201) {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `I have added ${item} to your list.`,
                },
                shouldEndSession: true,
            },
        };
    } else {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `Sorry, there was a problem adding ${item} to your list. Please try again later.`,
                },
                shouldEndSession: true,
            },
        };
    }
}

const handleRemoveItemIntent = async (item) => {
    let res = await getAllRecords()
    let list = JSON.parse(res.body)
    let itemToDelete = list.find(obj => obj.name === item)
   
    let result = await deleteRecord(itemToDelete.id)

    if (result.statusCode == 200) {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `I have removed ${item} to your list.`,
                },
                shouldEndSession: true,
            },
        };
    } else {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `Sorry, there was a problem removing ${item} from your list. Please try again later.`,
                },
                shouldEndSession: true,
            },
        };
    }
}

const handleAddNoteIntent = async (note) => {
    let result = await createRecord(note, 'notes_db')

    if (result.statusCode == 201) {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `I have added ${note} to your list.`,
                },
                shouldEndSession: true,
            },
        };
    } else {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `Sorry, there was a problem adding ${note} to your list. Please try again later.`,
                },
                shouldEndSession: true,
            },
        };
    }
}

const handleRemoveNoteIntent = async (str) => {
    tableName = 'notes_db'
    let res = await getAllRecords(null, defaultHeaders, tableName)
    let notes = JSON.parse(res.body)
    let noteToDelete = notes.find(note => note.name.includes(str))
    let result = await deleteRecord(noteToDelete.id, tableName)

    if (result.statusCode == 200) {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `I have removed ${noteToDelete.name} to your list.`,
                },
                shouldEndSession: true,
            },
        };
    } else {
        return {
            version: '1.0',
            response: {
                outputSpeech: {
                    type: 'PlainText',
                    text: `Sorry, there was a problem removing ${noteToDelete.name} from your list. Please try again later.`,
                },
                shouldEndSession: true,
            },
        };
    }
}

// DynamoDB 

const getAllRecords = async (id = null, headers = defaultHeaders, tableName) => {
    try {
        if (id) {
            const params = {
                TableName: tableName,
                Key: { id }
            };
            const data = await dynamo.send(new GetCommand(params));
            return {
                statusCode: 200,
                body: JSON.stringify(data.Item),
            };
        } else {
            const params = {
                TableName: tableName,
            };
            const data = await dynamo.send(new ScanCommand(params));
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify(data.Items),
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: error }),
        };
    }
};

const createRecord = async (item, tableName) => {
    let new_item = {
        id: randomUUID(),
        name: item,
    }
    try {
        const params = {
            TableName: tableName,
            Item: new_item
        };
        await dynamo.send(new PutCommand(params));
        return {
            statusCode: 201,
            body: JSON.stringify(new_item),
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message }),
        };
    }
};

const deleteRecord = async (id, tableName) => {
    try {
        const params = {
            TableName: tableName,
            Key: { id }
        };
        await dynamo.send(new DeleteCommand(params));
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Item deleted successfully' }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: error }),
        };
    }
};