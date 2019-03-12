# What is it?
This put tag and notify that something resource has been created by someone on your Azure.

The code name is "tyarin". "tyarin" is Japanese word, it means chink.

Flow  
- Cloud Functions is fired every 5 minute
- To get activitylog from azure
- To put tags and notify to stack if it detect that something has been created 

We need to code these custom script because of Azure Monitor or Log Analytics has no function to hook event like a
'something seems to be created' since azure activity logs is complicated and Log Analytics is poor.
Also, Azure Functions consumption plan is not able to run async process of nodejs v8(Promiss.all) at least when I was trying.So I have to deploy this function to Google Cloud Functions.

You can see detail and complicated azure activity logs from below.
https://docs.microsoft.com/ja-jp/rest/api/monitor/activitylogs/list

## Detail of Functions
- This function is triggered by Cloud PubSub
- To accuire access token from Azure Client ID and Secret
- To get list of azure subscriptions that the client can read 
- To do below actions each subscription
- To get activity logs filterd (current time - FROM_DIFF_MINUTES) to current time
- To get all supported api versions of all resource providers
- To find events that properties.statusCode is 'Created'. I call this 'created events'
- To list events that correlationId is same and status.value is 'succeeded' and ResourceProvider is not 'Microsoft.Resources' againt each event of 'created events' since to get relevant resources
- To get caller and eventtime about each event of 'created events'
- To make list of created resources with resourceid, caller, eventtime 
- Deduplication the list by resourceid
- To do below actions each resource of the list
- To get properties of resource utilizing resourceids
- To put new properties with caller tag and eventime tag if the properties not has caller tag and eventtime tag
- To nofity slack that a resource has been created

### Env Varibale

|name|type|Description|
|:---|:---|:---|
|AZURE_CLIENT_ID|string| Appid of service principal. We suppose this app can put tags every resource and read activity logs againt each subscriptions.
|AZURE_CLIENT_SECRET|string| Secret of service principal
|FROM_DIFF_MINUTES|int| Number of minutes of activity logs this function get every fired
|AZURE_TENANT|string| Name of Azure AD Tenant
|SLACK_CHANNEL|string| Channel of slack. e.g. #channel
|SLACK_WEBHOOK|string| Webhook URL

## deploy
- push code to cloud repositories (in my case)
- $ gcloud pubsub topics create tyarin
- $ gcloud pubsub subscriptions create tyarin --topic=tyarin
- Configure Google Cloud Scheduler. ref:https://qiita.com/tkykm/items/35a740f99e6dd52e0b75
- $ gcloud functions deploy tyarin --source='https://source.developers.google.com/projects/******/repos/tyarin/moveable-aliases/gcp' --runtime=nodejs8 --trigger-topic=tyarin --set-env-vars="FROM_DIFF_MINUTES"=10,"AZURE_CLIENT_ID"="*****","AZURE_CLIENT_SECRET"="*****","AZURE_TENANT"="******","SLACK_CHANNEL"="#channel","SLACK_WEBHOOK"="" --entry-point=tyarin


## image
![](https://s3-ap-northeast-1.amazonaws.com/hackmd-jp1/uploads/upload_469a79fec45078077ae3a583a9228b24.png)

You can click Resource Link then jump to azure portal and see the resource details


