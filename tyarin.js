'use strict';

var fs = require('fs');
var Requests = require('./requests');
const azureResourceRegex = new RegExp("\^/subscriptions/([a-f\\d\]{8}-[a-f\\d\]{4}-[a-f\\d\]{4}-[a-f\\d\]{4}-[a-f\\d\]{12})/resourcegroups/([a-zA-Z\\d\-\_\.\(\)].{1,90})/providers/([a-zA-Z\.\\d]+/[a-zA-Z]+)(/.+)", 'i');
class Tyarin{
    constructor(azureTenant){
        this._requests = new Requests(azureTenant);
    }
    async initialize(azureClientId, azureClientSecret){
        if(!azureClientId || !azureClientSecret)
          throw new Error("You must specify azure client id and secret");
        const azure_token = await this._requests.getAzureAccessToken(azureClientId, azureClientSecret);
        this._requests.setToken(azure_token);
    }

    writeFileAsync(name, content){
        return new Promise((resolve, reject) => {
            fs.writeFile(name, content, (err) => {
                if(err) reject(err);
                else resolve();
            });
        });
    }

    getSubscriptions(){
        return this._requests.getSubscriptions();
    }

    async run(azureSubscriptionId, azureSubscriptionName){
        let activityLogs = await this._requests.getActivityLogs(azureSubscriptionId);
        while('nextLink' in activityLogs){
            let logs = await this._requests.getActivityLogs(azureSubscriptionId, activityLogs.nextLink);
            logs.value = logs.value.concat(activityLogs.value);
            activityLogs = logs;
            console.debug(`retrieving ${azureSubscriptionId} logs....`);
        }

        let apiVersions = await this._requests.getApiVersions(azureSubscriptionId);

        // // save out tmp file since jq can not parse too big json that more than `getconf ARG_MAX`
        let file_activitylogs = `/tmp/activitylogs_${azureSubscriptionId}.json`;
        let file_apiversions = `/tmp/apiversions_${azureSubscriptionId}.json`;
        console.debug(`saving ${azureSubscriptionId} logs...`);
        await this.writeFileAsync(file_activitylogs, JSON.stringify(activityLogs));
        await this.writeFileAsync(file_apiversions, JSON.stringify(apiVersions));
        console.debug(`${azureSubscriptionId} logs has saved`);

        let correlationIds = await this._requests.getCorrelationIdFromCreatedLog(file_activitylogs, {input: 'file', output: 'json'});
        let correlationIdWithTime = correlationIds[1];
        console.log(correlationIdWithTime);
        correlationIds = correlationIds[0];
        console.debug(correlationIds); 
        let errors = [];
        for(let j = 0; j < correlationIds.length; j++){
            let eventTime = await this._requests.getEventTime(correlationIds[j], correlationIdWithTime, {input: 'json', output: 'json'});
            let resources = await this._requests.getResourcesFromCorrelationId(correlationIds[j], file_activitylogs, {input: 'file', output: 'json'});
            for(let i = 0; i < resources.length; i++){
                let resouceId_splited = resources[i].resourceId.split('/'); 
                let apiVersion = await this._requests.getApiVerion(
                    resouceId_splited[resouceId_splited.length -3],
                    resouceId_splited[resouceId_splited.length -2], 
                    file_apiversions,
                    {input: 'file', output: 'json'}
                );
                let properties;
                try{
                    properties = await this._requests.getResourceProperties(resources[i].resourceId, apiVersion);
                }
                catch(e){
                    errors.push(e);
                    continue;
                }
                console.debug([resources[i].resourceId, apiVersion]);
                if (!('tags' in properties)){
                    properties.tags = {};
                }
                if(!('caller' in properties.tags)){
                    try{
                        properties.tags.caller = resources[i].caller;
                        properties.tags.created = eventTime; 
                        console.debug(properties.tags.caller, properties.id);
                        let resultRegex = resources[i].resourceId.match(azureResourceRegex);
                        await this._requests.postSlack('', properties.tags.caller, properties.id, eventTime, azureSubscriptionName, resultRegex[2], resultRegex[3]);
                        let result = await this._requests.putResourceProperties(properties, apiVersion);
                        console.log(result);
                    }
                    catch(e){
                        console.error(e);
                        continue;
                    }
                }
            }
        }
        console.log(`${azureSubscriptionId}'s Ignored Errors:`, errors);

        fs.unlink(file_activitylogs, (err) => {}); 
        fs.unlink(file_apiversions, (err) => {});
    }
}


module.exports = Tyarin;
