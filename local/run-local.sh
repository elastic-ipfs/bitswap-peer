#!/usr/bin/env bash

# start up the local DynamoDB and S3 docker containers
docker-compose up -d


export AWS_ACCESS_KEY_ID=DUMMYIDEXAMPLE
export AWS_SECRET_ACCESS_KEY=DUMMYIDEXAMPLE
export AWS_DEFAULT_REGION=us-west-2

# create your local tables
aws dynamodb create-table --table-name local-ep-bitswap-config --attribute-definitions AttributeName=key,AttributeType=S --key-schema AttributeName=key,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

aws dynamodb create-table --table-name local-ep-cars --attribute-definitions AttributeName=path,AttributeType=S --key-schema AttributeName=path,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

aws dynamodb create-table --table-name local-ep-blocks --attribute-definitions AttributeName=multihash,AttributeType=S --key-schema AttributeName=multihash,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

aws dynamodb create-table --table-name local-ep-v1-cars --attribute-definitions AttributeName=path,AttributeType=S --key-schema AttributeName=path,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

aws dynamodb create-table --table-name local-ep-v1-blocks --attribute-definitions AttributeName=multihash,AttributeType=S --key-schema AttributeName=multihash,KeyType=HASH --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

aws dynamodb create-table --table-name local-ep-v1-blocks-cars-position --attribute-definitions AttributeName=blockmultihash,AttributeType=S AttributeName=carpath,AttributeType=S --key-schema AttributeName=blockmultihash,KeyType=HASH AttributeName=carpath,KeyType=RANGE --billing-mode PAY_PER_REQUEST --endpoint-url http://localhost:8000 --no-cli-pager

cat >peerIds-dynamodb.json <<EOL
{
  "key": { "S": "tagged-peers" },
  "value": { "S": "[ { \"name\": \"ipfs-bank1-sv14\", \"peer\": \"12D3KooWGW4U4iN6tcvFKcQD3Ay2i6LDdEAEJgZgdHUNasGGq8bb\" } ]" }
}
EOL

aws dynamodb put-item --table-name local-ep-bitswap-config --item file://peerIds-dynamodb.json --endpoint-url http://localhost:8000 --no-cli-pager