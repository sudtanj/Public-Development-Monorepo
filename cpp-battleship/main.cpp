#include <iostream>
#include <stdlib.h>
#include <string.h>
#include <time.h>
using namespace std;

int random(int min, int max) //range : [min, max)
{
   static bool first = true;
   if ( first ) 
   {  
      srand(time(NULL)); //seeding for the first time only!
      first = false;
   }
   return min + rand() % (max - min);
}

int main(){
    cout <<"Welcome to Battleship Game!!!"<<endl;
    cout<< "Player (P1) vs COM (P2)"<<endl;
    cout<<"Press 1 to start:"<<endl;
    srand(time(NULL));
    bool test=false;
    int locationW=0,locationH=0,width=10,height=10,map[height][width];
    memset(map, 0, sizeof(map[0][0]) * width * height);
    for(int i=2;i<=4;i++){
        test=false;
        locationW=random(0,width-(i-1));
        locationH=random(0,4);
        cout<<locationW << " "<< locationH<<endl;
        for(int j=0;j<i;j++){
            if(map[locationH][locationW+j]!=0){
               test=true;
               i-=1;
               break;
            }
        }
        if(test==false){
            for(int j=0;j<i;j++)
                map[locationH][locationW+j]=1;
        }
    }
    for(int i=0;i<10;i++){
        for(int j=0;j<10;j++){
            cout<<map[i][j]<< " ";
        }
        cout<<endl;
    }
    //second player
    for(int i=2;i<=4;i++){
        test=false;
        locationW=random(0,width-(i-1));
        locationH=random(5,9);
        cout<<locationW << " "<< locationH<<endl;
        for(int j=0;j<i;j++){
            if(map[locationH][locationW+j]!=0){
               test=true;
               i-=1;
               break;
            }
        }
        if(test==false){
            for(int j=0;j<i;j++)
                map[locationH][locationW+j]=2;
        }
    }
    for(int i=0;i<10;i++){
        for(int j=0;j<10;j++){
            cout<<map[i][j]<< " ";
        }
        cout<<endl;
    }
    int colTemp=0,rowTarget=0,colTarget=0,totalDestroy=0;
    while(true){
        if(totalDestroy==3){
            cout<<"Human Win"<<endl;
            break;
        }
        cout<<"Coloumn"<<endl;
        cin>>colTarget;
        cout<<"Row"<<endl;
        cin>>rowTarget;
        
        colTarget--;
        rowTarget--;
        
        if(map[rowTarget][colTarget]==2){
            totalDestroy++;
            colTemp=colTarget;
            while(map[rowTarget][colTemp]!=0){
                map[rowTarget][colTemp]=0;
                colTemp++;
            }
            cout<<colTarget;
            while(map[rowTarget][colTarget]!=0){
                map[rowTarget][colTarget]=0;
                colTarget--;
            }
            cout<<"You destroy a ship"<<endl;
        }
        
    for(int i=0;i<10;i++){
        for(int j=0;j<10;j++){
            cout<<map[i][j]<< " ";
        }
        cout<<endl;
    }
    }
    return 0;
}